import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArtwork } from '../src/deviantart/media-normalizer.js';
import { pickOfficialMediaUrl } from '../src/deviantart/official-api.js';

test('video poster without playable media is not reclassified as photo', () => {
  assert.throws(() => normalizeArtwork({
    deviationId: 1382575450, title: 'film', isVideo: true, type: 'film', filetype: 'video',
    media: { baseUri: 'https://cdn.test/poster.jpg', types: [{ t: 'fullview', b: 'https://cdn.test/poster_full.jpg' }] },
  }, { sourceUrl: 'https://www.deviantart.com/x/art/film-1382575450' }), /视频缺少可播放媒体/);
});

test('OAuth videos supply playable media and normalize as video', async () => {
  const deviation = { videos: [{ src: 'https://cdn.test/video.mp4', quality: '720p' }], content: { src: 'https://cdn.test/poster.jpg' } };
  assert.equal(await pickOfficialMediaUrl({}, deviation, 'uuid'), 'https://cdn.test/video.mp4');
});
