import { renderArtworkCaption } from '../rendering/caption.js';
import { planDelivery } from './delivery-planner.js';
import { telegram, telegramForm, preserveConfirmedDelivery, TelegramMediaTooLargeError, TelegramRejectedError } from './api.js';
import {
  PHOTO_MAX_BYTES, FILE_MAX_BYTES, MEDIA_FIELDS, MIME_BY_EXTENSION,
  detectFile, downloadMedia, isTooBigError,
} from './media-io.js';
import { prepareMultipart } from './multipart.js';
import { event } from '../runtime/status.js';

// Operational batching target, not a claimed Telegram aggregate API limit.
// Singleton files may exceed this target; the independent file limit applies.
export const DEFAULT_REQUEST_BYTES = 50 * 1024 * 1024;

function requestBudget(env) {
  const bytes = Number(env.TELEGRAM_ALBUM_MAX_BYTES);
  return Number.isSafeInteger(bytes) && bytes > 0 ? Math.min(bytes, DEFAULT_REQUEST_BYTES) : DEFAULT_REQUEST_BYTES;
}

function mediaRejection(error) {
  return error instanceof TelegramMediaTooLargeError ||
    (error instanceof TelegramRejectedError && error.status === 400 &&
      /file (?:is|of size .* is) too big|image is too big|PHOTO_INVALID_DIMENSIONS|IMAGE_PROCESS_FAILED|MEDIA_EMPTY|VIDEO_CONTENT_TYPE_INVALID|failed to get HTTP URL content|wrong file identifier|wrong type of the web page content/i.test(error.message));
}

function rememberFailure(state, item, error) {
  const failure = { assetId: item.assetId, sourceIndex: item.sourceIndex, reason: error instanceof TelegramMediaTooLargeError ? 'too_large' : 'media_failed' };
  state.results.failures.push(failure);
  event('media_delivery_failed', { asset_id: failure.assetId, source_index: failure.sourceIndex, reason: failure.reason, stage: error.stage, status: error.status, file_bytes: error.file_bytes, file_bytes_at_least: error.file_bytes_at_least });
}

function rememberSent(state, items, result) {
  const messages = Array.isArray(result) ? result : [result];
  state.results.push(...messages);
  items.forEach((item, i) => state.results.deliveries.push({ assetId: item.assetId, sourceIndex: item.sourceIndex, result: messages[i] }));
}

function notesEnabled(env, message) {
  const mode = String(env?.CAPTION_NOTES || 'auto').trim().toLowerCase();
  if (mode === 'always' || /^(1|true|yes)$/.test(mode)) return true;
  if (mode === 'never' || /^(0|false|no|off)$/.test(mode)) return false;
  return message?.chat?.type === 'private';
}

function reply(message) {
  return {
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: false },
    ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
  };
}

export async function sendArtworkPlan(media, message, env, { upload = false, onStatus = null, cap = null } = {}) {
  const units = planDelivery(media);
  const showNotes = notesEnabled(env, message);
  const caption = renderArtworkCaption(
    { title: cap?.title, author: cap?.author, mediaCount: cap?.mediaCount },
    cap?.status || {},
    { showNotes, sourceUrl: cap?.sourceUrl },
  ).text;
  const results = [];
  results.deliveries = [];
  results.failures = [];
  const state = { results, message, env, onStatus };

  for (const unit of units) {
    const primary = unit.primary;
    const unitCaption = primary ? caption : '';
    try {
      if (upload) await uploadUnit(unit, state, unitCaption);
      else {
        try { rememberSent(state, unit.items, await urlUnit(unit, message, env, unitCaption, primary, cap)); }
        catch (error) {
          // URL transfer has stricter limits. A confirmed media rejection can
          // use the same original bytes via multipart, once, without re-encoding.
          if (!mediaRejection(error)) throw error;
          await uploadUnit(unit, state, unitCaption);
        }
      }
    } catch (error) {
      throw preserveConfirmedDelivery(error, results);
    }
  }
  return results;
}

async function urlUnit(unit, message, env, caption, primary, cap) {
  if (unit.type === 'album') {
    const result = await telegram(env, 'sendMediaGroup', {
      chat_id: message.chat.id,
      media: unit.items.map((item, index) => ({
        type: item.kind,
        media: item.url,
        ...(index === 0 && caption ? { caption, parse_mode: 'HTML' } : {}),
      })),
      ...reply(message),
    });
    return Array.isArray(result) ? result : [result];
  }
  const item = unit.type === 'single' ? unit.items[0] : unit.item;
  const fields = MEDIA_FIELDS[item.kind];
    const result = await telegram(env, fields[0], {
      chat_id: message.chat.id,
      [fields[1]]: item.url,
      ...(caption ? { caption, parse_mode: 'HTML' } : {}),
      ...reply(message),
    });
    return [result];
}

async function uploadUnit(unit, state, caption) {
  let pending = [];
  let pendingBytes = 0;
  let remainingCaption = caption;
  const flush = async () => {
    if (!pending.length) return;
    const before = state.results.length;
    await uploadBatch(pending, state, remainingCaption);
    if (state.results.length > before) remainingCaption = '';
    pending = [];
    pendingBytes = 0;
  };
  for (const item of unit.items) {
    let downloaded;
    try {
      downloaded = typeof item.content === 'string' && item.content.length
        ? { bytes: new TextEncoder().encode(item.content), extension: item.extension || 'txt' }
        : await downloadMedia({ ...item, url: item.downloadUrl || item.url }, state.onStatus, '媒体下载', { maxBytes: FILE_MAX_BYTES, allowFallback: false });
      if (downloaded.bytes.byteLength > FILE_MAX_BYTES) throw new TelegramMediaTooLargeError({ file_bytes: downloaded.bytes.byteLength });
    } catch (error) {
      await flush();
      rememberFailure(state, item, error);
      continue;
    }
    // Send the original image as a document instead of lossy JPEG compression.
    const kind = item.kind === 'photo' && downloaded.bytes.byteLength > PHOTO_MAX_BYTES ? 'document' : item.kind;
    const entry = { item, kind, ...downloaded };
    if (pending.length && (kind === 'document' || kind === 'animation' || pendingBytes + entry.bytes.byteLength > requestBudget(state.env))) await flush();
    pending.push(entry);
    pendingBytes += entry.bytes.byteLength;
    if (kind === 'document' || kind === 'animation' || pending.length === 10) await flush();
  }
  await flush();
}

function uploadForm(entries, message, caption) {
  const form = baseForm(message);
  if (entries.length > 1) {
    form.set('media', JSON.stringify(entries.map((entry, i) => ({ type: entry.kind, media: `attach://file${i}`, ...(i === 0 && caption ? { caption, parse_mode: 'HTML' } : {}) }))));
    entries.forEach((entry, i) => form.set(`file${i}`, new Blob([entry.bytes], { type: MIME_BY_EXTENSION[entry.extension] || 'application/octet-stream' }), `file${i}.${entry.extension}`));
    return { method: 'sendMediaGroup', form };
  }
  const entry = entries[0];
  const [method, field] = MEDIA_FIELDS[entry.kind];
  if (caption) { form.set('caption', caption); form.set('parse_mode', 'HTML'); }
  form.set(field, new Blob([entry.bytes], { type: MIME_BY_EXTENSION[entry.extension] || 'application/octet-stream' }), `${entry.item.fileName || field}.${entry.extension}`);
  return { method, form };
}

async function uploadBatch(entries, state, caption) {
  const { method, form } = uploadForm(entries, state.message, caption);
  const prepared = await prepareMultipart(form);
  const split = async () => {
    const middle = Math.ceil(entries.length / 2);
    const before = state.results.length;
    await uploadBatch(entries.slice(0, middle), state, caption);
    await uploadBatch(entries.slice(middle), state, state.results.length > before ? '' : caption);
  };
  if (entries.length > 1 && prepared.bytes > requestBudget(state.env)) {
    event('tg_batch_split', { reason: 'request_budget', request_bytes: prepared.bytes, file_count: entries.length });
    return split();
  }
  state.onStatus?.(entries.length > 1 ? '正在发送相册…' : '正在发送…');
  try {
    rememberSent(state, entries.map(x => x.item), await telegramForm(state.env, method, prepared));
  } catch (error) {
    if (!mediaRejection(error)) throw error;
    if (entries.length > 1) {
      // Only a definite rejection permits subdivision. Each branch is smaller;
      // no identical failed batch is retried and confirmed messages stay sent.
      event('tg_batch_split', { reason: 'rejected', status: error.status, request_bytes: prepared.bytes, file_count: entries.length });
      return split();
    }
    const entry = entries[0];
    if (entry.kind === 'photo' && !(error instanceof TelegramMediaTooLargeError) && isTooBigError(error)) {
      return uploadBatch([{ ...entry, kind: 'document' }], state, caption);
    }
    rememberFailure(state, entry.item, error);
  }
}

function baseForm(message) {
  const form = new FormData();
  form.set('chat_id', String(message.chat.id));
  form.set('reply_parameters', JSON.stringify({ message_id: message.message_id, allow_sending_without_reply: false }));
  if (message.message_thread_id) form.set('message_thread_id', String(message.message_thread_id));
  return form;
}

export async function sendFileIdPlan(files, message, env, cap) {
  const units = planDelivery(files.map((file) => ({ kind: file.kind, file_id: file.file_id })));
  const caption = renderArtworkCaption(cap, cap.status || {}, { showNotes: notesEnabled(env, message), sourceUrl: cap.sourceUrl }).text;
  const confirmed = [];
  for (const unit of units) {
    try {
    const unitCaption = unit.primary ? caption : '';
    if (unit.type === 'album') {
      const result = await telegram(env, 'sendMediaGroup', {
        chat_id: message.chat.id,
        media: unit.items.map((item, i) => ({ type: item.kind, media: item.file_id || item.url, ...(i === 0 && unitCaption ? { caption: unitCaption, parse_mode: 'HTML' } : {}) })),
        ...reply(message),
      });
      confirmed.push(...(Array.isArray(result) ? result : [result]));
    } else {
      const item = unit.type === 'single' ? unit.items[0] : unit.item;
      const kind = item.kind;
      const value = item.file_id || item.url;
      const [method, field] = MEDIA_FIELDS[kind];
      const result = await telegram(env, method, {
        chat_id: message.chat.id,
        [field]: value,
        ...(unitCaption ? { caption: unitCaption, parse_mode: 'HTML' } : {}),
        ...reply(message),
      });
      confirmed.push(result);
    }
    } catch (error) {
      throw preserveConfirmedDelivery(error, confirmed);
    }
  }
}

export function filesFromResults(results) {
  return results.map(detectFile).filter(Boolean);
}
