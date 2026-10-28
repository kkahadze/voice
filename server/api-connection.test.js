import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Miniflare, Response as WorkerResponse } from 'miniflare';
import { handleConnection, resolveCredential } from './api-connection.js';

const origin = 'https://voice.example';
const env = { API_SESSION_SECRET: randomBytes(32).toString('base64url') };
const key = 'sk-test-not-a-real-key-1234567890';
function request(method = 'GET', body, headers = {}) {
  return new Request(`${origin}/api/connection`, { method, headers: { 'oai-authenticated-user-id': 'user-a', origin, 'content-type': 'application/json', ...headers }, ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}
const accept = async () => new Response('{}');

test('missing key prompts; server key is detected without being returned', async () => {
  assert.deepEqual(await (await handleConnection(request(), env)).json(), { configured: false, source: null, expiresAt: null });
  const response = await handleConnection(request(), { ...env, OPENAI_API_KEY: key });
  const text = await response.text();
  assert.equal(JSON.parse(text).source, 'server'); assert.ok(!text.includes(key));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('verified session is encrypted, user-bound, expiring, and removable', async () => {
  let forwarded;
  const result = await handleConnection(request('POST', { key }), env, { now: 1000, fetcher: async (url, init) => { forwarded = { url, init }; return accept(); } });
  assert.equal(result.status, 200);
  const cookie = result.headers.get('set-cookie');
  assert.ok(cookie.includes('HttpOnly')); assert.ok(cookie.includes('Secure')); assert.ok(cookie.includes('SameSite=Strict')); assert.ok(!cookie.includes(key));
  assert.equal(forwarded.url, 'https://api.openai.com/v1/models'); assert.equal(forwarded.init.headers.Authorization, `Bearer ${key}`);
  const withSession = request('GET', undefined, { cookie });
  assert.equal((await resolveCredential(withSession, env, 'user-a', 2000)).key, key);
  assert.equal(await resolveCredential(withSession, env, 'user-b', 2000), null);
  assert.ok(cookie.includes('Max-Age=31536000'));
  assert.equal((await resolveCredential(withSession, env, 'user-a', 14401001)).key, key);
  assert.equal(await resolveCredential(withSession, env, 'user-a', 1000 + 365 * 86400000), null);
  assert.equal(await resolveCredential(withSession, { API_SESSION_SECRET: randomBytes(32).toString('base64url') }, 'user-a', 2000), null);
  const deleted = await handleConnection(request('DELETE'), env);
  assert.ok(deleted.headers.get('set-cookie').includes('Max-Age=0'));
});
test('return visits renew remembered keys without asking OpenAI or leaking the key', async () => {
  const start = 1000;
  const saved = await handleConnection(request('POST', { key }), env, { now: start, fetcher: accept });
  const savedCookie = saved.headers.get('set-cookie');
  const visit = (cookie, userId = 'user-a') => request('GET', undefined, { cookie, 'oai-authenticated-user-id': userId });
  const noProvider = () => { throw new Error('Renewal must not call OpenAI'); };
  const sameDay = await handleConnection(visit(savedCookie), env, { now: start + 1000, fetcher: noProvider });
  assert.equal(sameDay.headers.get('set-cookie'), null);
  const returnTime = start + 30 * 86400000;
  const renewed = await handleConnection(visit(savedCookie), env, { now: returnTime, fetcher: noProvider });
  const body = await renewed.json();
  assert.equal(body.expiresAt, returnTime + 365 * 86400000);
  assert.ok(!JSON.stringify(body).includes(key));
  const renewedCookie = renewed.headers.get('set-cookie');
  assert.ok(renewedCookie.includes('Max-Age=31536000'));
  assert.equal((await resolveCredential(visit(renewedCookie), env, 'user-a', start + 366 * 86400000)).key, key);
  for (const req of [visit(savedCookie, 'user-b'), visit(savedCookie.replace('=', '=tampered'))]) {
    const rejected = await handleConnection(req, env, { now: returnTime, fetcher: noProvider });
    assert.equal((await rejected.json()).configured, false);
    assert.equal(rejected.headers.get('set-cookie'), null);
  }
  const expired = await handleConnection(visit(savedCookie), env, { now: start + 366 * 86400000, fetcher: noProvider });
  assert.equal((await expired.json()).configured, false);
  assert.equal(expired.headers.get('set-cookie'), null);
});
test('a still-valid old four-hour cookie upgrades on the next visit', async () => {
  const now = 1000;
  const iv = randomBytes(12);
  const encryptionKey = await crypto.subtle.importKey('raw', Buffer.from(env.API_SESSION_SECRET, 'base64url'), 'AES-GCM', false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('voice-api-v1') }, encryptionKey,
    new TextEncoder().encode(JSON.stringify({ key, userId: 'user-a', expiresAt: now + 4 * 3600000 })));
  const legacy = `__Host-voice-api=${iv.toString('base64url')}.${Buffer.from(encrypted).toString('base64url')}`;
  const upgraded = await handleConnection(request('GET', undefined, { cookie: legacy }), env, { now });
  assert.equal((await upgraded.json()).expiresAt, now + 365 * 86400000);
  assert.ok(upgraded.headers.get('set-cookie').includes('Max-Age=31536000'));
});
test('identity, same-origin, payload and storage checks happen before verification', async () => {
  let called = false; const options = { fetcher: async () => { called = true; return accept(); } };
  const cases = [
    [request('POST', { key }, { 'oai-authenticated-user-id': '' }), env, 401],
    [request('POST', { key }, { origin: 'https://attacker.example' }), env, 403],
    [request('POST', { key }, { 'content-type': 'text/plain' }), env, 415],
    [request('POST', { key: 'invalid' }), env, 400],
    [request('POST', 'broken JSON'), env, 400],
    [request('POST', 'x'.repeat(5000)), env, 413],
    [request('POST', { key }), {}, 503],
  ];
  for (const [req, settings, expected] of cases) assert.equal((await handleConnection(req, settings, options)).status, expected);
  assert.equal(called, false);
});
test('provider errors do not retain credentials or expose provider responses', async () => {
  for (const [status, expected] of [[401,422],[403,422],[429,429],[500,502]]) {
    const result = await handleConnection(request('POST', { key }), env, { fetcher: async () => new Response(`Secret fragment ${key}`, { status }) });
    assert.equal(result.status, expected); assert.equal(result.headers.get('set-cookie'), null); assert.ok(!(await result.text()).includes(key));
  }
  const result = await handleConnection(request('POST', { key }), env, { fetcher: async () => { throw new Error('offline'); } });
  assert.equal(result.status, 502);
});

test('key verification works in the Worker runtime and never follows redirects', async () => {
  const outgoing = [];
  const upstreamStatuses = [200, 401, 302];
  const source = await readFile(new URL('./api-connection.js', import.meta.url), 'utf8');
  const worker = new Miniflare({
    modules: true,
    modulesRules: [{type:'ESModule',include:['**/*.js']}],
    scriptPath: fileURLToPath(new URL('./api-connection.js', import.meta.url)),
    compatibilityDate: '2026-05-15',
    bindings: env,
    outboundService: req => {
      outgoing.push({ url: req.url, authorization: req.headers.get('authorization') });
      const status = upstreamStatuses.shift() || 500;
      return new WorkerResponse(`Provider response ${key}`, {
        status,
        ...(status === 302 ? { headers: { location: 'https://redirect.example/models' } } : {}),
      });
    },
    script: `${source}\nexport default { fetch(request, env) { return handleConnection(request, env); } };`,
  });
  const dispatch = async req => worker.dispatchFetch(req.url, {
    method: req.method,
    headers: Object.fromEntries(req.headers),
    ...(req.body ? { body: await req.text() } : {}),
  });
  try {
    const verified = await dispatch(request('POST', { key }));
    assert.equal(verified.status, 200);
    assert.equal((await verified.json()).configured, true);
    const sessionCookie = verified.headers.get('set-cookie');
    assert.ok(sessionCookie.includes('HttpOnly'));
    assert.ok(!sessionCookie.includes(key));
    const saved = await dispatch(request('GET', undefined, { cookie: sessionCookie }));
    assert.equal((await saved.json()).source, 'session');

    const rejected = await dispatch(request('POST', { key }));
    assert.equal(rejected.status, 422);
    assert.equal(rejected.headers.get('set-cookie'), null);
    assert.ok(!(await rejected.text()).includes(key));

    const redirected = await dispatch(request('POST', { key }));
    assert.equal(redirected.status, 502);
    assert.equal(redirected.headers.get('set-cookie'), null);
    assert.match((await redirected.json()).error, /unexpected redirect/);
    assert.deepEqual(outgoing, Array.from({ length: 3 }, () => ({ url: 'https://api.openai.com/v1/models', authorization: `Bearer ${key}` })));
  } finally {
    await worker.dispose();
  }
});
