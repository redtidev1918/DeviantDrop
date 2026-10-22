import { DA_HEADERS, DEVIANTART_ORIGIN } from '../deviantart/http.js';
import { TelegramMediaTooLargeError } from './api.js';
import { event } from '../runtime/status.js';

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const FILE_MAX_BYTES = 50 * 1024 * 1024;

export const MEDIA_FIELDS = {
  photo: ['sendPhoto', 'photo'],
  video: ['sendVideo', 'video'],
  animation: ['sendAnimation', 'animation'],
  document: ['sendDocument', 'document'],
};

export const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
};

export async function downloadMedia(item, onStatus = null, label = '媒体下载', { maxBytes = Infinity, allowFallback = true } = {}) {
  let response = await guardedFetch(item.url, {
    headers: { ...DA_HEADERS, Referer: DEVIANTART_ORIGIN },
    signal: AbortSignal.timeout(180_000),
  }, label);
  event('media_download_response', { asset_id: item.assetId, host: new URL(item.url).host, status: response.status });
  let usedFallback = false;
  if (!response.ok) {
    response.body?.cancel();
    if (allowFallback && (response.status === 403 || response.status === 429) && item.fallbackUrl && item.fallbackUrl !== item.url) {
      response = await guardedFetch(item.fallbackUrl, {
        headers: { ...DA_HEADERS, Referer: DEVIANTART_ORIGIN },
        signal: AbortSignal.timeout(120_000),
      }, '展示图下载');
      if (!response.ok) {
        response.body?.cancel();
        throw quotaOrMediaError(response.status);
      }
      usedFallback = true;
    } else {
      throw quotaOrMediaError(response.status);
    }
  }
  const advertised = response.headers.has('content-length') ? Number(response.headers.get('content-length')) : null;
  event('media_download', { asset_id: item.assetId, host: new URL(item.url).host, status: response.status, advertised_bytes: Number.isFinite(advertised) ? advertised : null });
  if (!response.headers.get('content-encoding') && advertised > maxBytes) {
    await response.body?.cancel();
    throw new TelegramMediaTooLargeError({ stage: 'download', file_bytes: advertised });
  }
  const chunks = [];
  const reader = response.body.getReader();
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new TelegramMediaTooLargeError({ stage: 'download', file_bytes_at_least: size });
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  // Same completeness check used by deviantart-downloader's HttpDownloader;
  // Content-Length describes encoded bytes, so don't compare after decoding.
  if (!response.headers.get('content-encoding') && advertised !== null && Number.isFinite(advertised) && advertised !== size) {
    throw new Error('媒体下载不完整，请稍后重试');
  }
  return { bytes: concatBytes(chunks), extension: guessExtension(usedFallback ? item.fallbackUrl : item.url, item.kind), usedFallback };
}

export async function compressPhoto(bytes) {
  try {
    const sharp = (await import('sharp')).default;
    // Single shared lazy pipeline: every candidate below is a clone of this
    // source, so the raw input is parsed once and each branch decodes only as
    // far as needed to produce its target (shrink-on-load for downscales).
    const source = sharp(bytes, { failOnError: 'none' });
    const meta = await source.metadata();
    if (!meta.width || !meta.height) return null;
    // Try the full-size re-compression first (best fidelity), then step down
    // the longest edge so genuinely oversized photos still fit rather than
    // falling back to a document.
    for (const scale of [1, 0.8, 0.64, 0.5, 0.4, 0.32]) {
      const width = Math.max(1, Math.round(meta.width * scale));
      const height = Math.max(1, Math.round(meta.height * scale));
      for (const quality of [85, 75, 65, 55, 45, 35]) {
        const out = await source
          .clone()
          .rotate()
          .resize({ width, height, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#fff' })
          .jpeg({ quality, progressive: true })
          .toBuffer();
        if (out.length <= PHOTO_MAX_BYTES) return out;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function detectFile(result) {
  if (!result) return null;
  if (result.document?.file_id) return { kind: 'document', file_id: result.document.file_id };
  if (result.video?.file_id) return { kind: 'video', file_id: result.video.file_id };
  if (result.animation?.file_id) return { kind: 'animation', file_id: result.animation.file_id };
  if (Array.isArray(result.photo) && result.photo.length) {
    return { kind: 'photo', file_id: result.photo.at(-1)?.file_id || result.photo[0]?.file_id };
  }
  return null;
}

export function isTooBigError(error) {
  return /file (?:is|of size .* is) too big|image is too big|too large|PHOTO_INVALID_DIMENSIONS/i.test(error?.message || String(error));
}

export function quotaOrMediaError(status) {
  if (status === 403) return new Error('DeviantArt 媒体访问被拒绝（HTTP 403），可能是权限或出口限制');
  if (status === 429) return new Error('DeviantArt 媒体请求过于频繁（HTTP 429），请稍后再试');
  return new Error(`媒体下载失败（HTTP ${status}）`);
}

async function guardedFetch(url, init, label) {
  try { return await fetch(url, init); }
  catch (error) { throw new Error(`${label}连接失败或超时，请稍后再试`, { cause: error }); }
}

function concatBytes(chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

export function guessExtension(mediaUrl, kind) {
  const leaf = new URL(mediaUrl).pathname.split('/').pop() || '';
  const ext = leaf.includes('.') ? leaf.split('.').pop().toLowerCase() : '';
  if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
  return { photo: 'jpg', video: 'mp4', animation: 'gif' }[kind] || 'bin';
}
