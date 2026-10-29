import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeArtwork, pickDescriptorMedia } from '../src/deviantart/media-normalizer.js';
import { renderArtworkCaption } from '../src/rendering/caption.js';
import { DeviantArtAdapter } from '../src/deviantart/adapter.js';
import { appendToken } from '../src/deviantart/media-normalizer.js';

test('query parameters and an existing signed URL are preserved without duplicate tokens', () => {
  assert.equal(appendToken('https://example.test/a.jpg?download=1', 'fresh'), 'https://example.test/a.jpg?download=1&token=fresh');
  assert.equal(appendToken('https://example.test/a.jpg?download=1&token=existing', 'fresh'), 'https://example.test/a.jpg?download=1&token=existing');
});

const evidence = JSON.parse(readFileSync(new URL('./fixtures/deviantart-bounded-media.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));

for (const sample of evidence.samples) {
  test(`captured ${sample.deviationId}: bounded signatures select fullview, not forbidden base or small preview`, () => {
    const artwork = normalizeArtwork(sample);
    const descriptors = [sample.media, ...sample.extended.additionalMedia.map(x => x.media)];
    assert.equal(artwork.media.length, descriptors.length);
    artwork.media.forEach((item, i) => {
      const descriptor = descriptors[i];
      const full = descriptor.types.find(t => t.t === 'fullview');
      const expected = descriptor.baseUri + full.c.replaceAll('<prettyName>', descriptor.prettyName);
      assert.equal(item.url, expected + '?token=' + descriptor.token[0]);
      assert.equal(item.assetId, `deviantart:${sample.extended.deviationUuid}:p${i}`);
      assert.equal(item.index, i);
      assert.equal(item.representation, 'fullview');
      assert.equal(item.originalAvailable, false);
    });
    assert.equal(new DeviantArtAdapter().accessStatus(artwork), sample.isMature ? 'mature' : 'public');
  });
}

test('unknown or unbounded tokens keep existing original URL selection', () => {
  const captured = evidence.samples[1].media;
  for (const token of [undefined, 'opaque', 'invalid.payload.signature']) {
    const media = pickDescriptorMedia({ ...captured, token });
    assert.equal(media.url, captured.baseUri + (token ? '?token=' + token : ''));
    assert.equal(media.representation, undefined);
  }
  // Controlled negative variant of the captured token: remove size constraints.
  const claims = JSON.parse(Buffer.from(captured.token[0].split('.')[1], 'base64url'));
  delete claims.obj[0][0].width;
  delete claims.obj[0][0].height;
  const token = `test.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.REDACTED`;
  assert.equal(pickDescriptorMedia({ ...captured, token }).url, captured.baseUri + '?token=' + token);
});

test('bounded hint never converts a GIF or video into a still image', () => {
  const captured = evidence.samples[1].media;
  const gif = { ...captured, baseUri: captured.baseUri.replace(/jpg$/, 'gif') };
  const claims = JSON.parse(Buffer.from(captured.token[0].split('.')[1], 'base64url'));
  claims.obj[0][0].path = new URL(gif.baseUri).pathname;
  gif.token = [`test.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.REDACTED`];
  assert.equal(pickDescriptorMedia(gif).kind, 'animation');
  assert.equal(pickDescriptorMedia(gif).url, gif.baseUri + '?token=' + gif.token[0]);
  const video = pickDescriptorMedia({ ...captured, types: [...captured.types, { t: 'video', b: 'https://example.test/movie.mp4', q: '1080p' }] }, { isVideo: true });
  assert.equal(video.kind, 'video');
  assert.equal(video.url, 'https://example.test/movie.mp4');
  assert.equal(pickDescriptorMedia(captured, { isVideo: true }), null);
});

test('no fullview means no automatic small-preview substitution', () => {
  const captured = evidence.samples[1].media;
  const media = pickDescriptorMedia({ ...captured, types: captured.types.filter(t => t.t !== 'fullview') });
  assert.equal(media.url, captured.baseUri + '?token=' + captured.token[0]);
});

test('fullview disclosure survives hidden technical notes and is not a paid/blurred warning', () => {
  const caption = renderArtworkCaption({ title: 'Work' }, { fullviewPages: [2] }, { showNotes: false }).text;
  assert.match(caption, /第 2 项为 DA 全尺寸展示图，非上传原文件/);
  assert.doesNotMatch(caption, /订阅|打码/);
});
