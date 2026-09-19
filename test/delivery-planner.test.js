import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planDelivery } from '../src/telegram/delivery-planner.js';
import { normalizeArtwork, isMatureLoggedOut } from '../src/deviantart/media-normalizer.js';

const media = (kind, n) => ({ kind, url: `https://example.test/${kind}-${n}`, fallbackUrl: null });

test('two photos and a GIF become one album plus one standalone animation', () => {
  const plan = planDelivery([media('photo', 1), media('photo', 2), media('animation', 1)]);
  assert.deepEqual(plan.map((unit) => ({ type: unit.type, kinds: unit.items.map((item) => item.kind), primary: unit.primary })), [
    { type: 'album', kinds: ['photo', 'photo'], primary: true },
    { type: 'standalone', kinds: ['animation'], primary: false },
  ]);
});

test('photo and video remain together; eleven album items split with caption only on the first unit', () => {
  const items = Array.from({ length: 11 }, (_, i) => media(i === 10 ? 'video' : 'photo', i));
  const plan = planDelivery(items);
  assert.equal(plan[0].items.length, 10);
  assert.equal(plan[1].items.length, 1);
  assert.equal(plan[0].primary, true);
  assert.equal(plan[1].primary, false);
});

test('mature_loggedout marks the response unauthorized: only extra pages are skipped', () => {
  const deviation = {
    isMature: true,
    isBlocked: true,
    isMultiMedia: true,
    blockReasons: ['mature_filter', 'mature_loggedout'],
    media: { baseUri: 'https://cdn.test/blur_x1.jpg', token: 'blur' },
    extended: { additionalMedia: [{ media: { baseUri: 'https://cdn.test/extra.png', token: 'x' } }] },
  };
  assert.equal(isMatureLoggedOut(deviation), true);
  const artwork = normalizeArtwork(deviation, { sourceUrl: 'https://www.deviantart.com/a/art/x-1', expansionAuthorized: false });
  assert.equal(artwork.expansionAuthorized, false);
  assert.equal(artwork.media.length, 1);
  assert.equal(artwork.skippedMedia, 1);
  // 主图由 OAuth 层负责；normalizer 只如实标注网页给的是打码文件。
  assert.equal(artwork.media[0].originalAvailable, false);
});

test('normalizeArtwork attaches stable asset identity to every media file', () => {
  const artwork = normalizeArtwork({
    deviationId: 'abc',
    isMultiMedia: true,
    media: { baseUri: 'https://cdn.test/main.jpg', token: 'm' },
    extended: {
      deviationUuid: 'u1',
      additionalMedia: [
        { media: { baseUri: 'https://cdn.test/p1.jpg', token: 'p1' } },
        { media: { baseUri: 'https://cdn.test/p2.png', token: 'p2' } },
      ],
    },
  }, { sourceUrl: 'https://www.deviantart.com/a/art/x-abc' });

  assert.deepEqual(artwork.media.map((m) => [m.assetId, m.index]), [
    ['deviantart:u1:p0', 0],
    ['deviantart:u1:p1', 1],
    ['deviantart:u1:p2', 2],
  ]);
});


test('shared conformance fixture normalizes consistently', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/deviantart_deviation.json', import.meta.url), 'utf8'));
  const artwork = normalizeArtwork(fixture, { sourceUrl: fixture.url });
  assert.equal(artwork.uuid, '11111111-2222-3333-4444-555555555555');
  assert.equal(artwork.title, 'Conformance Sample');
  assert.equal(artwork.author, 'conformance');
  assert.equal(artwork.mature, false);
  assert.equal(artwork.media.length, 2);
  assert.deepEqual(artwork.media.map((m) => m.assetId), [
    'deviantart:11111111-2222-3333-4444-555555555555:p0',
    'deviantart:11111111-2222-3333-4444-555555555555:p1',
  ]);
});
