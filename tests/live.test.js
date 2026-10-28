import {database} from './helpers/database.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createLiveSession } from '../server/live-session.js';
import {configForMode} from '../server/listen-config.js';
import { liveConfig } from '../server/live-config.js';
import { handleConnection } from '../server/api-connection.js';
import { Transcript } from '../public/transcript.js';
import { LiveVoice } from '../public/live-session.js';
import { bindVoiceBackground } from '../public/voice-background.js';

const key = 'sk-test-not-a-real-key-1234567890';
const origin = 'https://voice.example';
const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const request = (body = { sdp }, headers = {}) => new Request(origin + '/api/live/session', { method: 'POST', headers: { origin, 'oai-authenticated-user-id': 'user-a', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('handoff settings are preserved with Russian instruction strings and no added defaults', () => {
  const config = structuredClone(liveConfig);
  assert.match(config.instructions, /По умолчанию говори по-русски/);
  assert.match(config.delegation.responses.instructions, /По умолчанию используй русский/);
  delete config.instructions; delete config.delegation.responses.instructions;
  assert.deepEqual(config, { model: 'gpt-live-1', audio: { output: { voice: { id: 'voice_6ad289d96a788191a6b442f44383631d' } } }, delegation: { type: 'responses', responses: { parallel_tool_calls: false, model: 'gpt-6-luna', reasoning: { effort: 'medium' }, tools: [{ type: 'web_search' }] } } });
});
test('server exchanges SDP using the encrypted user credential and trusted config only', async t => {
  const DB=await database(t);
  const env = { DB, API_SESSION_SECRET: randomBytes(32).toString('base64url') };
  const saved = await handleConnection(request({ key }), env, { fetcher: async () => new Response('{}') });
  let calls = 0;
  const result = await createLiveSession(request({ sdp, session: { model: 'untrusted' }, key: 'untrusted' }, { cookie: saved.headers.get('set-cookie') }), env, { fetcher: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/live/sessions');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.redirect, 'manual');
    const sent=JSON.parse(options.body);assert.equal(sent.session.model,configForMode('talk').model);assert.deepEqual(sent.transport,{type:'webrtc',sdp});assert.match(sent.session.instructions,/ADAPTIVE RUSSIAN LESSON/);assert.match(sent.session.delegation.responses.instructions,/ADAPTIVE RUSSIAN LESSON/);
    return Response.json({ session: { id: 'opaque:session/keep-exact', extra: key }, transport: { sdp, type: 'webrtc' }, credential: key }, { status: 201 });
  } });
  assert.equal(calls, 1); assert.equal(result.status, 201);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), { session: { id: 'opaque:session/keep-exact' }, transport: { type: 'webrtc', sdp } });
});
test('auth, origin, SDP and body limits are enforced before any provider request', async t => {
  const DB=await database(t);
  let calls = 0;
  const options = { fetcher: async () => { calls++; throw new Error(); } };
  for (const [req, env, expected] of [
    [request({}, { 'oai-authenticated-user-id': '' }), {}, 401],
    [request({ sdp }, { origin: 'https://other.example' }), {}, 403],
    [request({}, { 'content-type': 'text/plain' }), {}, 415],
    [request({ sdp: 'invalid' }), {}, 400],
    [request({ sdp: 'v=0' + 'x'.repeat(70000) }), {}, 413],
    [request(), {}, 401],
  ]) assert.equal((await createLiveSession(req, {...env,DB}, options)).status, expected);
  assert.equal(calls, 0);
});
test('provider errors are actionable and never expose credentials', async t => {
  const DB=await database(t);
  for (const [providerStatus, expected] of [[400,400],[401,401],[403,403],[404,403],[429,429],[500,502],[302,502]]) {
    const result = await createLiveSession(request(), { DB, OPENAI_API_KEY: key }, { fetcher: async () => Response.json({ error: { message: key } }, { status: providerStatus }) });
    assert.equal(result.status, expected); assert.ok(!(await result.text()).includes(key));
  }
  const result = await createLiveSession(request(), { DB, OPENAI_API_KEY: key }, { fetcher: async () => { throw new Error(key); } });
  assert.equal((await result.json()).incomplete, true);
  const malformed = await createLiveSession(request(), { DB, OPENAI_API_KEY: key }, { fetcher: async () => Response.json({}) });
  assert.equal((await malformed.json()).incomplete, true);
});
test('transcript grouping uses audio times across overlapping speakers, preserving exact deltas', () => {
  const transcript = new Transcript();
  const add = (speaker, delta, start_ms, end_ms, event_id) => transcript.add({ type: `session.${speaker}_transcript.delta`, delta, start_ms, end_ms, event_id });
  add('input', ' ещё', 300, 500, 'b');
  add('output', 'Да.', 180, 260, 'c');
  add('input', 'Я', 100, 200, 'a');
  add('input', ' ещё', 500, 700, 'd');
  add('input', ' ещё', 500, 700, 'd');
  add('input', 'Новая фраза', 3000, 3500, 'e');
  assert.deepEqual(transcript.groups(), [
    { speaker: 'user', start: 100, end: 700, text: 'Я ещё ещё' },
    { speaker: 'teacher', start: 180, end: 260, text: 'Да.' },
    { speaker: 'user', start: 3000, end: 3500, text: 'Новая фраза' },
  ]);
});

class Track extends EventTarget { enabled = true; stopped = false; stop() { this.stopped = true; } }
class Channel extends EventTarget {
  readyState = 'open'; sent = []; closed = false;
  send(value) { this.sent.push(JSON.parse(value)); }
  message(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
  close() { this.closed = true; this.dispatchEvent(new Event('close')); }
}
class Peer extends EventTarget {
  iceGatheringState = 'complete'; connectionState = 'new'; channel = new Channel(); closed = false;
  addTrack() {}
  createDataChannel(label) { assert.equal(label, 'oai-events'); return this.channel; }
  async createOffer() { return { type: 'offer', sdp }; }
  async setLocalDescription(offer) { this.localDescription = offer; }
  async setRemoteDescription(answer) { this.answer = answer; }
  close() { this.closed = true; }
}
function fixture(options = {}) {
  const pc = new Peer(), track = new Track(), states = [], events = [], audio = [];
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const timeouts = new Map(); let timerId = 0;
  const timers = { setTimeout(fn, delay) { const id = ++timerId; timeouts.set(id, { fn, delay }); return id; }, clearTimeout(id) { timeouts.delete(id); } };
  const voice = new LiveVoice({ media: { getUserMedia: async () => stream }, peer: () => pc, request: async () => Response.json({ session: { id: 'opaque-session' }, transport: { sdp } }), onState: state => states.push(state), onEvent: event => events.push(event), onAudio: value => audio.push(value), timers, ...options });
  const started = () => pc.channel.message({ type: 'session.started', session: { id: 'opaque-session' } });
  const closed = () => pc.channel.message({ type: 'session.closed', reason: 'close_requested', usage: { seconds: 3 }, session: { id: 'opaque-session' } });
  return { voice, pc, track, stream, states, events, audio, timeouts, started, closed };
}
test('WebRTC waits for started without resending config, plays remote media and drains final events', async () => {
  const f = fixture(); await f.voice.start();
  assert.equal(f.voice.state, 'connecting'); assert.equal(f.track.enabled, false); assert.deepEqual(f.pc.channel.sent, []);
  assert.deepEqual(f.pc.answer, { type: 'answer', sdp });
  f.started(); assert.equal(f.voice.state, 'active'); assert.equal(f.track.enabled, true);
  const remote = new Event('track'); remote.streams = [f.stream]; f.pc.dispatchEvent(remote); assert.equal(f.audio[0], f.stream);
  f.voice.close(); f.voice.close();
  assert.deepEqual(f.pc.channel.sent, [{ type: 'session.close' }]);
  assert.equal(f.voice.state, 'closing'); assert.equal(f.track.stopped, false); assert.equal(f.pc.closed, false);
  f.pc.channel.message({ type: 'session.output_transcript.delta', delta: 'Пока!', start_ms: 10, end_ms: 20 });
  assert.equal(f.events.at(-1).delta, 'Пока!');
  f.closed(); assert.equal(f.voice.state, 'idle'); assert.equal(f.track.stopped, true); assert.equal(f.pc.closed, true);
  assert.equal(f.voice.lastSession.finalized, true); assert.deepEqual(f.voice.lastSession.usage, { seconds: 3 });
  assert.equal(f.timeouts.size, 0);
});
test('close during startup waits for started and then finalization', async () => {
  const f = fixture(); await f.voice.start(); f.voice.close();
  assert.equal(f.voice.state, 'closing'); assert.deepEqual(f.pc.channel.sent, []); assert.equal(f.pc.closed, false);
  f.started(); assert.deepEqual(f.pc.channel.sent, [{ type: 'session.close' }]); assert.equal(f.track.enabled, false);
  f.closed(); assert.equal(f.voice.lastSession.finalized, true);
});
test('disconnect and close timeout explicitly report incomplete finalization', async () => {
  for (const cause of ['disconnect', 'timeout']) {
    const f = fixture(); await f.voice.start(); f.started(); f.voice.close();
    if (cause === 'disconnect') f.pc.channel.close();
    else [...f.timeouts.values()].find(t => t.delay === 15000).fn();
    assert.equal(f.voice.state, 'error'); assert.equal(f.voice.lastSession.finalized, false);
    assert.equal(f.states.at(-1).incomplete, true); assert.match(f.states.at(-1).message, /finalization/i);
    assert.equal(f.track.stopped, true); assert.equal(f.pc.closed, true);
  }
});
test('permission denial and rejected credentials release resources without a false active state', async () => {
  const denied = fixture({ media: { getUserMedia: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } });
  await denied.voice.start(); assert.equal(denied.voice.state, 'error'); assert.match(denied.states.at(-1).message, /Allow microphone/);
  const invalid = fixture({ request: async () => Response.json({ error: 'Update API key' }, { status: 401 }) });
  await invalid.voice.start(); assert.equal(invalid.voice.state, 'error'); assert.equal(invalid.track.stopped, true); assert.equal(invalid.states.at(-1).incomplete, false);
});
test('cancelled permission request stops a late microphone stream and cannot start a session', async () => {
  let resolve; const media = { getUserMedia: () => new Promise(r => { resolve = r; }) };
  const f = fixture({ media }); const pending = f.voice.start(); f.voice.close(); resolve(f.stream); await pending;
  assert.equal(f.voice.state, 'idle'); assert.equal(f.track.stopped, true); assert.equal(f.pc.localDescription, undefined);
});

function backgroundFixture({ unsupported = false } = {}) {
  const doc = Object.assign(new EventTarget(), { hidden: false }), win = new EventTarget();
  const f = fixture({ isBackground: () => doc.hidden });
  const handlers = new Map(), microphones = [];
  const nav = unsupported ? {} : {
    audioSession: Object.assign(new EventTarget(), { type: 'auto', state: 'active' }),
    mediaSession: {
      setActionHandler(action, handler) { handlers.set(action, handler); },
      setMicrophoneActive(active) { microphones.push(active); },
    },
  };
  let plays = 0;
  const background = bindVoiceBackground({ voice: f.voice, audio: { srcObject: f.stream }, playAudio: () => { plays++; }, navigator: nav, document: doc, window: win, Metadata: class { constructor(data) { Object.assign(this, data); } } });
  f.voice.onState = state => { f.states.push(state); background.update(state); };
  const visibility = hidden => { doc.hidden = hidden; doc.dispatchEvent(new Event('visibilitychange')); };
  return { ...f, doc, win, nav, handlers, microphones, visibility, background, get plays() { return plays; } };
}

test('locking or switching apps preserves the same live call and returning resumes audio', async () => {
  const f = backgroundFixture(); await f.voice.start(); f.started();
  f.pc.connectionState = 'connected';
  const call = f.voice.current;
  assert.equal(f.nav.audioSession.type, 'play-and-record');
  f.visibility(true);
  assert.equal(f.voice.current, call); assert.equal(f.voice.state, 'active');
  assert.equal(f.track.enabled, true); assert.equal(f.track.stopped, false);
  assert.deepEqual(f.pc.channel.sent, []); assert.equal(f.plays, 0);
  f.visibility(false);
  assert.equal(f.plays, 1); assert.equal(f.voice.current, call);
  f.win.dispatchEvent(new Event('pageshow'));
  assert.equal(f.plays, 2); assert.equal(f.voice.current, call);
  f.voice.close(); f.closed();
});

test('phone microphone and audio-session interruptions are visible and recover without restarting', async () => {
  const f = backgroundFixture(); await f.voice.start(); f.started();
  f.track.muted = true; f.track.dispatchEvent(new Event('mute'));
  assert.equal(f.voice.state, 'active'); assert.equal(f.microphones.at(-1), true);
  assert.match(f.states.at(-1).message, /Microphone paused/);
  assert.deepEqual(f.pc.channel.sent, []);
  f.track.muted = false; f.track.dispatchEvent(new Event('unmute'));
  assert.equal(f.states.at(-1).message, 'Listening'); assert.equal(f.microphones.at(-1), true);
  f.nav.audioSession.state = 'interrupted'; f.nav.audioSession.dispatchEvent(new Event('statechange'));
  assert.equal(f.states.at(-1).microphonePaused, true);
  f.nav.audioSession.state = 'active'; f.nav.audioSession.dispatchEvent(new Event('statechange'));
  assert.equal(f.states.at(-1).message, 'Listening'); assert.equal(f.plays, 1);
  f.voice.close(); f.closed();
});

test('system stop controls mute immediately, finalize once, and cannot reopen a stopped microphone', async () => {
  for (const action of ['pause', 'stop', 'hangup']) {
    const f = backgroundFixture(); await f.voice.start(); f.started();
    const oldPlay = f.handlers.get('play');
    f.handlers.get(action)();
    assert.equal(f.track.enabled, false); assert.equal(f.track.stopped, false);
    assert.equal(f.voice.state, 'closing'); assert.equal(f.microphones.at(-1), false);
    f.visibility(false); f.visibility(true); oldPlay();
    f.track.dispatchEvent(new Event('unmute'));
    assert.equal(f.voice.state, 'closing'); assert.equal(f.plays, 0);
    assert.deepEqual(f.pc.channel.sent, [{ type: 'session.close' }]);
    f.closed(); oldPlay(); f.visibility(false); f.visibility(true);
    assert.equal(f.voice.current, null); assert.equal(f.track.stopped, true);
    assert.equal(f.nav.audioSession.type, 'auto'); assert.equal(f.nav.mediaSession.metadata, null);
    assert.equal(f.nav.mediaSession.playbackState, 'none');
    assert.ok([...f.handlers.values()].every(handler => handler === null));
    assert.equal(f.plays, 0);
  }
});

test('headphone audio resumes after an interruption while the phone stays locked', async () => {
  const f = backgroundFixture(); await f.voice.start(); f.started();
  const call = f.voice.current;
  f.visibility(true);
  f.nav.audioSession.state = 'interrupted'; f.nav.audioSession.dispatchEvent(new Event('statechange'));
  assert.equal(f.plays, 0); assert.equal(f.microphones.at(-1), true);
  f.handlers.get('play')();
  assert.equal(f.plays, 0); // Do not fight another app's active interruption.
  f.nav.audioSession.state = 'active'; f.nav.audioSession.dispatchEvent(new Event('statechange'));
  assert.equal(f.plays, 1); assert.equal(f.doc.hidden, true);
  assert.equal(f.voice.current, call); assert.equal(f.track.enabled, true);
  assert.equal(f.microphones.at(-1), true); assert.deepEqual(f.pc.channel.sent, []);
  f.voice.close(); f.closed();
});

test('system microphone controls keep the call connected and respect mute during recovery', async () => {
  const f = backgroundFixture(); await f.voice.start(); f.started(); f.visibility(true);
  const toggle = f.handlers.get('togglemicrophone');
  toggle(); assert.equal(f.track.enabled, false); assert.equal(f.microphones.at(-1), false);
  assert.match(f.states.at(-1).message, /^Microphone muted/);
  f.nav.audioSession.state = 'active'; f.nav.audioSession.dispatchEvent(new Event('statechange'));
  assert.equal(f.track.enabled, false); assert.equal(f.voice.state, 'active');
  toggle(); assert.equal(f.track.enabled, true); assert.equal(f.microphones.at(-1), true);
  assert.deepEqual(f.pc.channel.sent, []);
  f.voice.close(); toggle(); assert.equal(f.track.enabled, false);
  f.closed(); toggle(); assert.equal(f.voice.current, null);
});

test('browsers without optional audio APIs and rejected OS controls still support calls', async () => {
  for (const unsupported of [true, false]) {
    const f = backgroundFixture({ unsupported });
    if (!unsupported) {
      f.nav.mediaSession.setActionHandler = () => { throw new Error('Unsupported'); };
      f.nav.mediaSession.setMicrophoneActive = () => Promise.reject(new Error('Denied'));
      Object.defineProperty(f.nav.audioSession, 'type', { set() { throw new Error('Unsupported'); } });
    }
    await f.voice.start(); f.started(); f.visibility(true); f.visibility(false);
    assert.equal(f.voice.state, 'active'); assert.equal(f.track.enabled, true);
    f.voice.close(); f.closed();
    assert.equal(f.voice.state, 'idle');
    await Promise.resolve();
  }
});

test('background disconnections allow recovery and stale timers cannot end a connected call', async () => {
  const f = backgroundFixture(); await f.voice.start(); f.started(); f.visibility(true);
  f.pc.connectionState = 'disconnected'; f.pc.dispatchEvent(new Event('connectionstatechange'));
  const pending = [...f.timeouts.values()].find(timer => timer.delay === 30000);
  assert.ok(pending); assert.equal(f.states.at(-1).message, 'Reconnecting…');
  // The network recovered before a delayed JS connection event/timer was handled.
  f.pc.connectionState = 'connected'; pending.fn();
  assert.equal(f.voice.state, 'active'); assert.equal(f.track.stopped, false);
  f.pc.dispatchEvent(new Event('connectionstatechange')); f.visibility(false);
  assert.equal(f.states.at(-1).message, 'Listening');
  f.voice.close(); f.closed();
});

test('returning with an actually disconnected call uses a bounded foreground recovery window', async () => {
  const f = backgroundFixture(); await f.voice.start(); f.started(); f.visibility(true);
  f.pc.connectionState = 'disconnected'; f.pc.dispatchEvent(new Event('connectionstatechange'));
  f.visibility(false);
  assert.ok(![...f.timeouts.values()].some(timer => timer.delay === 30000));
  [...f.timeouts.values()].find(timer => timer.delay === 5000).fn();
  assert.equal(f.voice.state, 'error'); assert.equal(f.track.stopped, true);
  assert.equal(f.voice.lastSession.finalized, false);
  f.visibility(false); assert.equal(f.voice.current, null);
});

test('Safari capture controls cannot feed a track pause back into repeated stop commands', async () => {
  const f = backgroundFixture();
  f.nav.mediaSession.setMicrophoneActive = active => {
    f.microphones.push(active);
    assert.ok(f.microphones.length < 10, 'capture feedback loop');
    f.track.muted = !active;
    f.track.dispatchEvent(new Event(active ? 'unmute' : 'mute'));
  };
  await f.voice.start();
  assert.deepEqual(f.microphones, [], 'connecting must not ask Safari to disable capture');
  f.started();
  assert.deepEqual(f.microphones, [true]);
  f.track.muted = true; f.track.dispatchEvent(new Event('mute'));
  f.voice.refreshMediaState();
  assert.deepEqual(f.microphones, [true], 'an observed pause must not send an off command');
  assert.equal(f.states.at(-1).microphonePaused, true);
  assert.doesNotMatch(f.states.at(-1).message, /Unlock/);
  f.background.resumeMicrophone();
  assert.deepEqual(f.microphones, [true, true]);
  assert.equal(f.track.muted, false);
  assert.equal(f.states.at(-1).message, 'Listening');
  assert.deepEqual(f.pc.channel.sent, [], 'recovery keeps the existing conversation');
  f.voice.close(); f.closed();
  assert.deepEqual(f.microphones, [true, true, false]);
  f.background.resumeMicrophone();
  assert.deepEqual(f.microphones, [true, true, false]);
});

test('Safari explicit microphone on/off actions are idempotent rather than blind toggles', async () => {
  const f = backgroundFixture(); await f.voice.start(); f.started();
  const toggle = f.handlers.get('togglemicrophone');
  toggle({isActivating:true}); toggle({isActivating:true});
  assert.equal(f.track.enabled, true);
  assert.deepEqual(f.microphones, [true]);
  toggle({isActivating:false}); toggle({isActivating:false});
  assert.equal(f.track.enabled, false);
  assert.deepEqual(f.microphones, [true, false]);
  f.visibility(false);
  assert.equal(f.track.enabled, false, 'foreground recovery must respect explicit mute');
  toggle({isActivating:true});
  assert.equal(f.track.enabled, true);
  assert.deepEqual(f.microphones, [true, false, true]);
  f.voice.close(); f.closed(); toggle({isActivating:true});
  assert.equal(f.track.enabled, false);
});
