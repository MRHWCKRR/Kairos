import { readBoundedText } from '../server/http-body.js';

export function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export async function invokeHandler(handler, request, { maxBodyBytes = 1024 * 1024, clientMetadata = {} } = {}) {
  let body;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const declaredSize = request.headers.get('content-length');
    if (declaredSize && Number(declaredSize) > maxBodyBytes) return jsonResponse({ error: 'Payload too large' }, 413);
    try {
      const text = await readBoundedText(request, maxBodyBytes);
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      return jsonResponse({ error: error.status === 413 ? 'Payload too large' : 'Invalid JSON' }, error.status === 413 ? 413 : 400);
    }
  }
  const url = new URL(request.url);
  const req = { method: request.method, headers: Object.fromEntries(request.headers), query: Object.fromEntries(url.searchParams), body, clientMetadata };
  let status = 200;
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  let responseBody = null;
  const res = {
    status(value) { status = value; return this; },
    setHeader(key, value) { headers.set(key, value); return this; },
    json(value) { headers.set('Content-Type', 'application/json'); responseBody = JSON.stringify(value); return this; },
    end() { return this; }
  };
  await handler(req, res);
  return new Response(request.method === 'HEAD' ? null : responseBody, { status, headers });
}
