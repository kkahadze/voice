import {languageApi} from './languages.js';
export class LiveVoice {
  constructor({ media = navigator.mediaDevices, peer = () => new RTCPeerConnection(), request = (...args) => fetch(...args), onState = () => {}, onEvent = () => {}, onAudio = () => {}, timers = globalThis, isBackground = () => !!globalThis.document?.hidden } = {}) {
    Object.assign(this, { media, peer, request, onState, onEvent, onAudio, timers, isBackground });
    this.state = 'idle'; this.current = null; this.lastSession = null;
  }
  update(state, message = '', extra = {}) {
    this.state = state;
    this.onState({ state, message, ...extra });
  }
  cleanup(ctx) {
    if (this.current !== ctx) return;
    this.current = null;
    for (const timer of ctx.timers) this.timers.clearTimeout(timer);
    ctx.stream?.getTracks().forEach(track => track.stop());
    ctx.channel?.close(); ctx.pc?.close(); this.onAudio(null);
  }
  fail(ctx, message, incomplete = ctx.requested) {
    if (this.current !== ctx) return;
    this.lastSession = { id: ctx.id || null, finalized: false, incomplete, usage: ctx.usage, backendUsage: ctx.backendUsage };
    this.cleanup(ctx);
    this.update('error', message + (incomplete && !/finalization/i.test(message) ? ' Finalization could not be confirmed.' : ''), { incomplete });
  }
  after(ctx, ms, callback) {
    const timer = this.timers.setTimeout(() => { if (this.current === ctx) callback(); }, ms);
    ctx.timers.push(timer); return timer;
  }
  refreshMediaState() {
    const ctx = this.current;
    if (!ctx?.started || ctx.closing) return;
    const microphonePaused = !!ctx.microphoneMuted || !!this.audioInterrupted || !!ctx.stream?.getAudioTracks().some(track => track.muted);
    const message = ctx.microphoneMuted ? 'Microphone muted. Tap Resume microphone to speak.' : microphonePaused ? (this.isBackground() ? 'Microphone paused by your phone. Return to Voice to resume.' : 'Microphone paused. Tap Resume microphone. If it stays paused, enable the microphone in Safari’s website controls.') : ctx.pc?.connectionState === 'disconnected' ? 'Reconnecting…' : 'Listening';
    this.update('active', message, { microphonePaused });
  }
  toggleMicrophone(isActivating) {
    const ctx = this.current;
    if (!ctx?.started || ctx.closing) return;
    ctx.microphoneMuted = typeof isActivating === 'boolean' ? !isActivating : !ctx.microphoneMuted;
    ctx.stream.getAudioTracks().forEach(track => { track.enabled = !ctx.microphoneMuted; });
    this.refreshMediaState();
  }
  checkConnection(ctx) {
    if (this.current !== ctx) return;
    const state = ctx.pc.connectionState;
    if (state === 'failed' || state === 'closed') { this.fail(ctx, 'Voice connection lost.'); return; }
    if (state === 'disconnected' && !ctx.disconnectTimer) {
      ctx.disconnectTimer = this.after(ctx, this.isBackground() ? 30000 : 5000, () => {
        ctx.disconnectTimer = null;
        // A timer delayed while the phone slept must not end a recovered call.
        if (ctx.pc.connectionState === 'disconnected') this.fail(ctx, 'Voice connection disconnected. Tap the microphone to continue.');
      });
    }
    if (state === 'connected' && ctx.disconnectTimer) { this.timers.clearTimeout(ctx.disconnectTimer); ctx.disconnectTimer = null; }
    this.refreshMediaState();
  }
  resume() {
    const ctx = this.current;
    if (!ctx || ctx.closing) return;
    if (ctx.disconnectTimer) { this.timers.clearTimeout(ctx.disconnectTimer); ctx.disconnectTimer = null; }
    this.checkConnection(ctx);
  }
  async start({mode = 'talk', lessonId, topicId, context, targetId} = {}) {
    if (this.current) return;
    const ctx = { timers: [], requested: false, started: false, closing: false, closeSent: false, backendUsage: [] };
    this.current = ctx;
    this.update('connecting', 'Allow microphone access');
    try {
      const stream = await this.media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.current !== ctx) { stream.getTracks().forEach(track => track.stop()); return; }
      ctx.stream = stream;
      ctx.pc = this.peer();
      const pc = ctx.pc;
      stream.getAudioTracks().forEach(track => {
        track.enabled = false;
        pc.addTrack(track, stream);
        track.addEventListener('ended', () => { if (this.current === ctx) this.close(); });
        for (const event of ['mute', 'unmute']) track.addEventListener(event, () => { if (this.current === ctx) this.refreshMediaState(); });
      });
      pc.addEventListener('track', event => {
        if (this.current === ctx) this.onAudio(event.streams[0] || new MediaStream([event.track]));
      });
      pc.addEventListener('connectionstatechange', () => this.checkConnection(ctx));
      ctx.channel = pc.createDataChannel('oai-events');
      ctx.channel.addEventListener('message', message => {
        if (this.current !== ctx) return;
        let event; try { event = JSON.parse(message.data); } catch { return; }
        if (event.type === 'session.started') {
          ctx.started = true;
          ctx.id = event.session?.id || ctx.id;
          this.timers.clearTimeout(ctx.startupTimer);
          this.onEvent(event);
          if (ctx.closing) this.sendClose(ctx);
          else { stream.getAudioTracks().forEach(track => { track.enabled = true; }); this.refreshMediaState(); }
        } else if (event.type === 'session.closed') {
          this.lastSession = { id: event.session?.id || ctx.id, finalized: true, reason: event.reason, usage: event.usage, session: event.session, backendUsage: ctx.backendUsage };
          this.onEvent(event);
          this.cleanup(ctx);
          const message = event.reason === 'content' ? 'The voice session was ended by OpenAI.' : event.reason === 'expired' ? 'Session ended. Tap to start again.' : event.reason === 'connection_lost' ? 'Connection lost; session finalized.' : '';
          this.update('idle', message, { finalized: true });
        } else {
          if (event.type === 'session.usage.updated') ctx.usage = event.usage;
          if (event.type === 'response.event' && event.event?.response?.usage) ctx.backendUsage.push({ id: event.event.response.id, usage: event.event.response.usage });
          this.onEvent(event);
        }
      });
      ctx.channel.addEventListener('close', () => { if (this.current === ctx) this.fail(ctx, 'Voice connection closed.'); });
      ctx.channel.addEventListener('error', () => { if (this.current === ctx) this.fail(ctx, 'The voice event connection failed.'); });
      this.update('connecting', 'Connecting…');
      const offer = await pc.createOffer();
      if (this.current !== ctx) return;
      await pc.setLocalDescription(offer);
      if (pc.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
        const timeout = this.timers.setTimeout(() => { pc.removeEventListener('icegatheringstatechange', changed); reject(new Error('Audio connection setup timed out.')); }, 10000);
        const changed = () => {
          if (pc.iceGatheringState === 'complete') { this.timers.clearTimeout(timeout); pc.removeEventListener('icegatheringstatechange', changed); resolve(); }
        };
        pc.addEventListener('icegatheringstatechange', changed); changed();
      });
      if (this.current !== ctx) return;
      if (!pc.localDescription?.sdp) throw new Error('Couldn’t prepare an audio connection.');
      ctx.requested = true;
      const response = await this.request(languageApi('/api/live/session'), {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(35000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: pc.localDescription.sdp, mode, lessonId, topicId, context, targetId }),
      });
      if (this.current !== ctx) return;
      let result; try { result = await response.json(); } catch { throw new Error('The voice server returned an unreadable response.'); }
      if (!response.ok) { this.fail(ctx, result.error || 'Couldn’t start voice.', !!result.incomplete); return; }
      if (typeof result.session?.id !== 'string' || typeof result.transport?.sdp !== 'string') throw new Error('The voice response was incomplete.');
      ctx.id = result.session.id;
      await pc.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp });
      if (this.current === ctx && !ctx.started) ctx.startupTimer = this.after(ctx, 20000, () => this.fail(ctx, 'The voice session did not finish connecting.'));
      // HTTP already started the session. Never resend startup configuration.
    } catch (error) {
      const message = error.name === 'NotAllowedError' ? 'Allow microphone access in your browser, then try again.' : error.name === 'NotFoundError' ? 'No microphone was found.' : error.name === 'NotReadableError' ? 'Your microphone is busy or unavailable.' : error.name === 'TimeoutError' ? 'The voice connection timed out.' : 'Couldn’t connect to voice. Check your connection and try again.';
      this.fail(ctx, message);
    }
  }
  sendClose(ctx) {
    if (ctx.closeSent || this.current !== ctx) return;
    if (ctx.channel?.readyState !== 'open') { this.fail(ctx, 'Voice disconnected before it could finish.'); return; }
    ctx.closeSent = true;
    this.update('closing', 'Finishing…');
    // Keep media and transport alive until the registered final-event handler runs.
    this.after(ctx, 15000, () => this.fail(ctx, 'Incomplete finalization: the voice session did not confirm it finished.', true));
    try { ctx.channel.send(JSON.stringify({ type: 'session.close' })); }
    catch { this.fail(ctx, 'Voice disconnected before it could finish.'); }
  }
  close() {
    const ctx = this.current;
    if (!ctx || ctx.closing) return;
    ctx.closing = true;
    // Stop sending microphone audio immediately, while still draining the final
    // transcript and session.closed event over the existing transport.
    ctx.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
    if (!ctx.requested) { this.cleanup(ctx); this.update('idle'); return; }
    this.update('closing', 'Finishing…');
    if (ctx.started) this.sendClose(ctx);
    // During HTTP negotiation, wait for session.started before requesting close.
  }
}
