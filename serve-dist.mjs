import { createReadStream, statSync } from 'node:fs';
import { createServer, request as createHttpRequest } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number.parseInt(process.env.OVERLAY_PORT || '4173', 10);
const host = process.env.OVERLAY_HOST || process.env.HOST || '127.0.0.1';
const apiPort = Number.parseInt(process.env.BOT_PORT || '8797', 10);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.wasm', 'application/wasm'],
  ['.onnx', 'application/octet-stream'],
]);

function sendFile(response, filePath) {
  const type = types.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': type,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Referrer-Policy': 'no-referrer',
  });
  createReadStream(filePath).pipe(response);
}

function proxyApi(request, response) {
  const upstreamPath = getUpstreamApiPath(request.url || '/');
  const upstream = createHttpRequest(
    {
      headers: {
        ...request.headers,
        host: `127.0.0.1:${apiPort}`,
      },
      hostname: '127.0.0.1',
      method: request.method,
      path: upstreamPath,
      port: apiPort,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'application/json' });
    }
    response.end(JSON.stringify({ ok: false, error: 'Local API proxy failed.' }));
  });
  request.pipe(upstream);
}

function getUpstreamApiPath(path) {
  const url = new URL(path, 'http://127.0.0.1');
  if (
    url.pathname.startsWith('/api/ai/') ||
    url.pathname.startsWith('/api/tts/') ||
    url.pathname.startsWith('/api/twitch/') ||
    url.pathname.startsWith('/api/mock/')
  ) {
    url.pathname = url.pathname.slice('/api'.length);
  }
  return `${url.pathname}${url.search}`;
}

createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
  if (url.pathname.startsWith('/api/')) {
    if (!isAllowedApiProxyPath(url.pathname)) {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'API proxy path is not exposed.' }));
      return;
    }
    proxyApi(request, response);
    return;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad Request');
    return;
  }
  const safe = normalize(decoded).replace(/^([/\\.]+)+/, '');
  let filePath = join(root, safe || 'index.html');
  try {
    const st = statSync(filePath);
    if (st.isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
    return sendFile(response, filePath);
  } catch {}
  return sendFile(response, join(root, 'index.html'));
}).listen(port, host, () => {
  console.log(`YourWifey overlay listening on http://${host}:${port}`);
});

function isAllowedApiProxyPath(pathname) {
  return (
    pathname.startsWith('/api/ai/') ||
    pathname === '/api/health' ||
    pathname.startsWith('/api/twitch/') ||
    pathname.startsWith('/api/tts/') ||
    pathname.startsWith('/api/mock/')
  );
}
