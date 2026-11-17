const ALLOWED_SERVICES = new Set(['auth', 'rest', 'storage']);
const BLOCKED_REQUEST_HEADERS = new Set(['connection', 'content-length', 'host', 'transfer-encoding']);
const BLOCKED_RESPONSE_HEADERS = new Set(['connection', 'content-encoding', 'content-length', 'transfer-encoding']);

export function localSupabaseTarget(path, search = '', env = process.env) {
  const parts = Array.isArray(path) ? path : [];
  if (parts.length < 2 || !ALLOWED_SERVICES.has(parts[0]) || parts[1] !== 'v1') return null;
  if (parts.some((part) => part === '.' || part === '..')) return null;

  const base = env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:8001';
  const target = new URL(parts.map(encodeURIComponent).join('/'), `${base.replace(/\/$/, '')}/`);
  target.search = search;
  return target;
}

function forwardedHeaders(request) {
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!BLOCKED_REQUEST_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  });
  return headers;
}

function responseHeaders(upstream) {
  const headers = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!BLOCKED_RESPONSE_HEADERS.has(name.toLowerCase())) headers.append(name, value);
  });
  return headers;
}

export async function proxyLocalSupabase(request, context) {
  const { path } = await context.params;
  const target = localSupabaseTarget(path, request.nextUrl.search);
  if (!target) return Response.json({ error: 'Unknown local Supabase service.' }, { status: 404 });

  const method = request.method.toUpperCase();
  const upstream = await fetch(target, {
    method,
    headers: forwardedHeaders(request),
    body: method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
    cache: 'no-store'
  });

  return new Response(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders(upstream)
  });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = proxyLocalSupabase;
export const HEAD = proxyLocalSupabase;
export const POST = proxyLocalSupabase;
export const PUT = proxyLocalSupabase;
export const PATCH = proxyLocalSupabase;
export const DELETE = proxyLocalSupabase;
export const OPTIONS = proxyLocalSupabase;
