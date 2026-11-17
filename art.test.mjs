import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import sharp from 'sharp';
import { artworkKey, parseArtworkKey, renderSvg, selectArtwork } from './art.mjs';
import { createArtworkServer } from './server.mjs';

const beforeZurichMidnight = new Date('2026-11-17T22:59:59Z');
const afterZurichMidnight = new Date('2026-11-17T23:00:00Z');
const options = new URLSearchParams({ zone: 'Europe/Zurich' });

test('daily editions remain stable through refreshes and rotate at local midnight', () => {
  const first = selectArtwork(options, new Date('2026-11-17T06:00:00Z'));
  assert.deepEqual(first, selectArtwork(options, beforeZurichMidnight));
  const next = selectArtwork(options, afterZurichMidnight);
  assert.equal(next.date, '2026-11-18');
  assert.notEqual(artworkKey(next), artworkKey(first));
  assert.notEqual(next.style, first.style);
  assert.equal(selectArtwork(new URLSearchParams({ zone: 'bad-zone' }), afterZurichMidnight).date, '2026-11-17');
});

test('weekly editions start on local Monday, including at month boundaries', () => {
  const weekly = new URLSearchParams({ zone: 'Europe/Zurich', cadence: 'weekly' });
  assert.equal(selectArtwork(weekly, new Date('2026-11-30T00:00:00Z')).date, '2026-11-30');
  assert.equal(selectArtwork(weekly, new Date('2026-12-06T22:59:59Z')).date, '2026-11-30');
  assert.equal(selectArtwork(weekly, new Date('2026-12-06T23:00:00Z')).date, '2026-12-07');
});

test('explicit style, palette and density are preserved and the personal seed changes the composition', () => {
  const query = new URLSearchParams({ style: 'strata', palette: 'ink', density: 'layered' });
  const first = selectArtwork(query, beforeZurichMidnight);
  assert.equal(first.style, 'strata');
  assert.equal(first.palette, 'ink');
  assert.equal(first.density, 'layered');
  query.set('seed', 'test edition');
  const second = selectArtwork(query, beforeZurichMidnight);
  assert.notEqual(renderSvg(first, 'landscape'), renderSvg(second, 'landscape'));
});

test('the gallery includes all six styles and existing artwork URLs retain their rendering', () => {
  const selected = new Set();
  for (let day = 17; day < 23; day++) {
    selected.add(selectArtwork(options, new Date(Date.UTC(2026, 10, day, 12))).style);
  }
  assert.deepEqual(selected, new Set([
    'orbital_geometry', 'constructivist', 'strata', 'flow_fields', 'topographic', 'organic_growth',
  ]));
  const originalImages = createHash('sha256');
  for (const style of ['orbital_geometry', 'constructivist', 'strata']) {
    const art = parseArtworkKey(`v1-2026-11-17-${style}-poster-balanced-7acd603d`);
    for (const orientation of ['landscape', 'portrait']) originalImages.update(renderSvg(art, orientation));
  }
  assert.equal(originalImages.digest('hex'), '05f7d059c91232534a15960c6158f2fb76510f7691caf6086bfb8de5a6f38a78');
});

test('new styles render PNGs with different seeds and densities in both orientations', async () => {
  for (const style of ['flow_fields', 'topographic', 'organic_growth']) {
    const query = new URLSearchParams({ style, palette: 'ink' });
    const balanced = selectArtwork(query, beforeZurichMidnight);
    assert.equal(balanced.style, style);
    assert.deepEqual(parseArtworkKey(artworkKey(balanced)), balanced);
    query.set('density', 'layered');
    const layered = selectArtwork(query, beforeZurichMidnight);
    query.set('seed', 'another edition');
    const reseeded = selectArtwork(query, beforeZurichMidnight);
    for (const [orientation, expected] of Object.entries({ landscape: [2560, 1440], portrait: [1440, 2560] })) {
      const image = renderSvg(layered, orientation);
      assert.notEqual(image, renderSvg(balanced, orientation));
      assert.notEqual(image, renderSvg(reseeded, orientation));
      const png = await sharp(Buffer.from(image)).png().toBuffer();
      const metadata = await sharp(png).metadata();
      assert.deepEqual([metadata.width, metadata.height], expected);
    }
  }
});

test('manifest image URLs render at both native resolutions and support immutable caching', async t => {
  const origin = 'https://artwork.example.com';
  const server = createArtworkServer(origin, () => beforeZurichMidnight).listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const manifest = await fetch(`${base}/v1/artwork?zone=Europe%2FZurich`);
  assert.equal(manifest.headers.get('cache-control'), 'no-store');
  const data = await manifest.json();
  assert.equal(data.edition_date, '2026-11-17');
  for (const [orientation, expected] of Object.entries({ landscape: [2560, 1440], portrait: [1440, 2560] })) {
    assert.equal(new URL(data.images[orientation]).origin, origin);
    const imageUrl = base + new URL(data.images[orientation]).pathname;
    const image = await fetch(imageUrl);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.match(image.headers.get('cache-control'), /immutable/);
    const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    assert.deepEqual([metadata.width, metadata.height], expected);
    const conditional = await fetch(imageUrl, { headers: { 'If-None-Match': image.headers.get('etag') } });
    assert.equal(conditional.status, 304);
    const invalid = await fetch(imageUrl.replace('2026-11-17', '2026-02-30'));
    assert.equal(invalid.status, 404);
  }
});
