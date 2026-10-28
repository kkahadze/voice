import {requestLanguage} from './language.js';
const SESSION_SECONDS = 365 * 24 * 60 * 60;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
const encode = value => btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const decode = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const encoder = new TextEncoder();
const cookieName = request => new URL(request.url).protocol === 'https:' ? '__Host-voice-api' : 'voice-api';

function json(data, status = 200, cookie) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}
function cookie(request, value, maxAge = SESSION_SECONDS) {
  return `${cookieName(request)}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
async function encryptionKey(secret) {
  const bytes = decode(secret);
  if (bytes.length !== 32) throw new Error('Session configuration unavailable');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(payload, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('voice-api-v1') }, await encryptionKey(secret), encoder.encode(JSON.stringify(payload)));
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
async function session(request, env, userId, now) {
  try {
    const token = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName(request)}=`))?.split('=').slice(1).join('=');
    if (!token || token.length > 3000 || !env.API_SESSION_SECRET) return null;
    const [iv, ciphertext] = token.split('.');
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: encoder.encode('voice-api-v1') }, await encryptionKey(env.API_SESSION_SECRET), decode(ciphertext));
    const payload = JSON.parse(new TextDecoder().decode(data));
    return payload.userId === userId && payload.expiresAt > now && typeof payload.key === 'string' ? payload : null;
  } catch { return null; }
}

// Server-only: future voice endpoints can resolve a credential without exposing it to JavaScript.
export async function resolveCredential(request, env, userId, now = Date.now()) {
  if (env.OPENAI_API_KEY?.trim()) return { key: env.OPENAI_API_KEY.trim(), source: 'server' };
  const saved = await session(request, env, userId, now);
  return saved ? { key: saved.key, source: 'session', expiresAt: saved.expiresAt } : null;
}

export async function handleConnection(request, env, { fetcher = fetch, now = Date.now() } = {}) {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId) return json({ error: 'Sign in to this app, then try again.' }, 401);
  try{requestLanguage(request);}catch{return json({error:'Choose Russian or Spanish.'},400);}
  if (request.method === 'GET') {
    const credential = await resolveCredential(request, env, userId, now);
    // Extend remembered keys on return visits, including still-valid legacy
    // four-hour cookies. Only the server can decrypt or renew this user-bound key.
    if (credential?.source === 'session' && credential.expiresAt <= now + SESSION_SECONDS * 1000 - RENEW_AFTER_MS) {
      const expiresAt = now + SESSION_SECONDS * 1000;
      const token = await seal({ key: credential.key, userId, expiresAt }, env.API_SESSION_SECRET);
      return json({ configured: true, source: 'session', expiresAt }, 200, cookie(request, token));
    }
    return json({ configured: !!credential, source: credential?.source || null, expiresAt: credential?.expiresAt || null });
  }
  if (!['POST', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Please reopen this app and try again.' }, 403);
  if (request.method === 'DELETE') return json({ configured: !!env.OPENAI_API_KEY?.trim(), source: env.OPENAI_API_KEY?.trim() ? 'server' : null }, 200, cookie(request, '', 0));
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Expected a key.' }, 415);
  // Bound the body while reading, including requests without Content-Length.
  if (Number(request.headers.get('content-length')) > 4096) return json({ error: 'Key is too long.' }, 413);
  let body;
  try {
    const reader = request.body?.getReader();
    const parts = []; let size = 0;
    if (!reader) throw new Error();
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 4096) { await reader.cancel(); return json({ error: 'Key is too long.' }, 413); } parts.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return json({ error: 'Enter a valid OpenAI API key.' }, 400); }
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!/^sk-[A-Za-z0-9_-]{16,1000}$/.test(key)) return json({ error: 'Enter an OpenAI API key beginning with sk-.' }, 400);
  try { await encryptionKey(env.API_SESSION_SECRET || ''); }
  catch { return json({ error: 'Secure key storage is unavailable. Please try again later.' }, 503); }
  let verification;
  try {
    // Workers supports manual redirects, but rejects redirect: 'error' before sending the request.
    verification = await fetcher('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000), redirect: 'manual' });
  } catch { return json({ error: 'The app couldn’t reach OpenAI. Please try again.' }, 502); }
  // Do not forward provider bodies: authentication errors can contain credential fragments.
  await verification.body?.cancel();
  // Never forward the Authorization header to a redirected destination.
  if (verification.status >= 300 && verification.status < 400) return json({ error: 'OpenAI returned an unexpected redirect. Please try again later.' }, 502);
  if (verification.status === 401) return json({ error: 'OpenAI didn’t accept that key. Check it and try again.' }, 422);
  if (verification.status === 403) return json({ error: 'This key cannot be verified. Check its project and model-list permissions.' }, 422);
  if (verification.status === 429) return json({ error: 'OpenAI is limiting requests. Wait a moment and try again.' }, 429);
  if (!verification.ok) return json({ error: 'OpenAI is temporarily unavailable. Please try again.' }, 502);
  const expiresAt = now + SESSION_SECONDS * 1000;
  const token = await seal({ key, userId, expiresAt }, env.API_SESSION_SECRET);
  return json({ configured: true, source: 'session', expiresAt }, 200, cookie(request, token));
}
