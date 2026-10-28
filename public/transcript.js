export class Transcript {
  constructor() { this.fragments = []; this.ids = new Set(); }
  add(event) {
    const speaker = event.type === 'session.input_transcript.delta' ? 'user' : event.type === 'session.output_transcript.delta' ? 'teacher' : null;
    if (!speaker || typeof event.delta !== 'string' || !Number.isFinite(event.start_ms) || !Number.isFinite(event.end_ms) || event.end_ms < event.start_ms) return false;
    if (event.event_id && this.ids.has(event.event_id)) return false;
    if (event.event_id) this.ids.add(event.event_id);
    this.fragments.push({ speaker, text: event.delta, start: event.start_ms, end: event.end_ms, order: this.fragments.length });
    return true;
  }
  groups() {
    const groups = [];
    for (const speaker of ['user', 'teacher']) {
      let current;
      for (const fragment of this.fragments.filter(f => f.speaker === speaker).sort((a, b) => a.start - b.start || a.end - b.end || a.order - b.order)) {
        if (!current || fragment.start - current.end > 1400) {
          current = { speaker, start: fragment.start, end: fragment.end, text: '' };
          groups.push(current);
        }
        current.end = Math.max(current.end, fragment.end);
        current.text += fragment.text;
      }
    }
    return groups.sort((a, b) => a.start - b.start || a.end - b.end);
  }
}
