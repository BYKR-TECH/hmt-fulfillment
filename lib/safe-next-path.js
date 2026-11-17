// Only same-origin absolute paths are allowed after login: "/orders" is fine,
// "//evil.example", "/\evil.example", "https://…" and "javascript:…" fall back to "/".
export function safeNextPath(value) {
  const next = String(value || '');
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f\u007f]/.test(next)) return '/';
  return next;
}
