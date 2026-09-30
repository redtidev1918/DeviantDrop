import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { compressPhoto, PHOTO_MAX_BYTES } from '../src/telegram/media-io.js';

// A genuine oversized photo that cannot fit under the Telegram photo limit even
// at full-resolution JPEG quality 35, so the streaming path must resize the
// longest edge down to land under the limit.
async function oversizedNoiseFixture() {
  return sharp({
    create: {
      width: 8000,
      height: 6000,
      channels: 3,
      noise: { type: 'gaussian', mean: 128, sigma: 100 },
    },
  }).jpeg({ quality: 95 }).toBuffer();
}

test('compressPhoto returns a valid JPEG under the byte limit via downscaling', async () => {
  const bytes = await oversizedNoiseFixture();
  // This fixture cannot fit under the limit at full resolution, so without the
  // resize step compressPhoto would return null and this test would fail.
  const srcMeta = await sharp(bytes).metadata();

  const out = await compressPhoto(bytes);
  assert.ok(out, 'compressPhoto should produce a compressed buffer');
  assert.ok(out.length <= PHOTO_MAX_BYTES, `compressed size ${out.length} must not exceed ${PHOTO_MAX_BYTES}`);

  const meta = await sharp(out).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.ok(meta.width && meta.height, 'compressed buffer must decode to a non-empty image');
  assert.ok(meta.width < srcMeta.width && meta.height < srcMeta.height,
    'oversized photo should be downscaled rather than falling back to a document');
});

test('compressPhoto returns null for bytes sharp cannot process', async () => {
  const out = await compressPhoto(Buffer.from('this is not an image file at all'));
  assert.equal(out, null);
});