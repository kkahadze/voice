// Keep the existing WebRTC call alive when the page is hidden. These APIs
// describe a real call to the OS; they cannot override an OS microphone pause.
export function bindVoiceBackground({ voice, audio, playAudio, languageName = 'Russian', navigator: nav = globalThis.navigator, document: doc = globalThis.document, window: win = globalThis.window, Metadata = globalThis.MediaMetadata }) {
  let engaged = false, previousAudioType, lastMicrophoneActive;
  const actions = ['play', 'pause', 'stop', 'hangup', 'togglemicrophone'];
  const optional = operation => { try { Promise.resolve(operation()).catch(() => {}); } catch {} };
  const reportMicrophone = (active, force = false) => {
    if (!force && lastMicrophoneActive === active) return;
    // Set before calling Safari: the API can itself trigger track events.
    lastMicrophoneActive = active;
    optional(() => nav.mediaSession?.setMicrophoneActive?.(active));
  };
  const resume = () => {
    if (!voice.current || voice.current.closing) return;
    voice.audioInterrupted = nav.audioSession?.state === 'interrupted';
    voice.resume();
    if (audio.srcObject && !voice.audioInterrupted) optional(playAudio);
  };
  const visible = () => {
    // Screen locking and app switching are not hang-up gestures.
    if (!doc.hidden) resume();
  };
  const audioState = () => {
    if (!engaged) return;
    voice.audioInterrupted = nav.audioSession?.state === 'interrupted';
    voice.refreshMediaState();
    // Headphone/audio interruptions can finish while the screen stays locked.
    // Resume the existing call then; do not wait for a foreground transition.
    if (!voice.audioInterrupted) resume();
  };
  doc.addEventListener('visibilitychange', visible);
  win.addEventListener('pageshow', visible);
  nav.audioSession?.addEventListener?.('statechange', audioState);

  return {
    resumeMicrophone() {
      if (!voice.current?.started || voice.current.closing) return;
      // Only an explicit user gesture requests capture after an OS pause.
      const alreadyRequested = lastMicrophoneActive === true;
      voice.toggleMicrophone(true);
      if (alreadyRequested) reportMicrophone(true, true);
      resume();
    },
    update({ state }) {
      const connected = ['connecting', 'active', 'closing'].includes(state);
      if (connected && !engaged) {
        engaged = true;
        optional(() => {
          if (nav.audioSession) {
            previousAudioType = nav.audioSession.type;
            nav.audioSession.type = 'play-and-record';
          }
        });
        optional(() => {
          if (nav.mediaSession && Metadata) nav.mediaSession.metadata = new Metadata({ title: 'Voice', artist: `${languageName} conversation` });
        });
        for (const action of actions) optional(() => nav.mediaSession?.setActionHandler(action,
          action === 'play' ? resume : action === 'togglemicrophone' ? details => voice.toggleMicrophone(details?.isActivating) : () => voice.close()));
      }
      if (!engaged) return;
      optional(() => { if (nav.mediaSession) nav.mediaSession.playbackState = connected ? 'playing' : 'none'; });
      // This API controls capture, not merely its status indicator. Never echo
      // track.muted or an audio interruption back as a command to stop capture.
      // In particular, do not disable Safari capture during connection setup.
      if (state === 'active') reportMicrophone(!voice.current?.microphoneMuted);
      else if (state !== 'connecting') reportMicrophone(false);
      if (!connected) {
        engaged = false;
        for (const action of actions) optional(() => nav.mediaSession?.setActionHandler(action, null));
        optional(() => { if (nav.mediaSession) nav.mediaSession.metadata = null; });
        optional(() => { if (nav.audioSession) nav.audioSession.type = previousAudioType || 'auto'; });
        voice.audioInterrupted = false;
        lastMicrophoneActive = undefined;
      }
    },
  };
}
