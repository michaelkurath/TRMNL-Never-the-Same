import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { artworkKey, orientations, parseArtworkKey, renderSvg, selectArtwork } from './art.mjs';

const manifestHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function json(response, status, body) {
  response.writeHead(status, manifestHeaders);
  response.end(JSON.stringify(body));
}

export function createArtworkServer(publicOrigin, clock = () => new Date()) {
  const origin = new URL(publicOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without credentials or a path');
  }

  return createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return json(response, 405, { error: 'Method not allowed' });
      }

      const url = new URL(request.url, origin);
      if (url.pathname === '/health') {
        return json(response, 200, { status: 'ok' });
      }

      if (url.pathname === '/v1/artwork') {
        const art = selectArtwork(url.searchParams, clock());
        const key = artworkKey(art);
        const imageUrl = orientation => new URL(`/v1/images/${key}/${orientation}.png`, origin).href;
        return json(response, 200, {
          artwork_id: `nts-${key}`,
          edition_date: art.date,
          style: art.style,
          images: { landscape: imageUrl('landscape'), portrait: imageUrl('portrait') },
        });
      }

      const route = /^\/v1\/images\/([^/]+)\/(landscape|portrait)\.png$/.exec(url.pathname);
      const art = route && parseArtworkKey(route[1]);
      if (!art) return json(response, 404, { error: 'Artwork not found' });

      const orientation = route[2];
      const etag = `"nts-${route[1]}-${orientation}"`;
      const headers = {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': 'image/png',
        ETag: etag,
      };
      if (request.headers['if-none-match'] === etag) {
        response.writeHead(304, headers);
        return response.end();
      }

      const image = await sharp(Buffer.from(renderSvg(art, orientation))).png().toBuffer();
      response.writeHead(200, { ...headers, 'Content-Length': image.length });
      response.end(image);
    } catch (error) {
      console.error(error);
      if (!response.headersSent) json(response, 500, { error: 'Artwork rendering failed' });
      else response.destroy();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || '127.0.0.1';
  const origin = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${port}`;
  createArtworkServer(origin).listen(port, host, () => console.log(`Never the Same API listening on ${host}:${port}`));
}
