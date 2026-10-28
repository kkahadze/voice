(() => {
  const dialog = document.querySelector('#api-dialog');
  const form = document.querySelector('#api-form');
  const input = document.querySelector('#api-key');
  const message = document.querySelector('#api-message');
  const description = document.querySelector('#api-description');
  const submit = document.querySelector('#api-submit');
  const retry = document.querySelector('#api-retry');
  const forget = document.querySelector('#api-forget');
  const done = document.querySelector('#api-done');
  const entry = document.querySelector('#api-settings');
  let state = null;
  let pending = [];
  let operation = null;

  async function request(method = 'GET', body, signal) {
    const response = await fetch('/api/connection', {
      method, credentials: 'same-origin', cache: 'no-store', signal,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    let result;
    try { result = await response.json(); }
    catch { throw new Error('Couldn’t check the API connection. Please try again.'); }
    if (!response.ok) throw new Error(result.error || 'Couldn’t check the API connection. Please try again.');
    return result;
  }
  function render(next, error = '') {
    state = next;
    const configured = !!next?.configured;
    form.hidden = configured || !next;
    forget.hidden = next?.source !== 'session';
    retry.hidden = !!next;
    done.hidden = !configured;
    description.hidden = !configured;
    description.textContent = configured
      ? next.source === 'server' ? 'An API key is configured for this app.' : 'Key saved in this browser. Remembered for a year, renewed when you return.'
      : '';
    message.textContent = error;
    entry.textContent = configured ? 'API key configured' : 'API connection';
  }
  function open() { if (!dialog.open) dialog.showModal(); }
  function finish(ready = false) {
    operation?.abort(); operation = null;
    input.value = '';
    dialog.close();
    pending.splice(0).forEach(resolve => resolve(ready));
  }
  async function check({ show = false, quiet = false } = {}) {
    try {
      const next = await request('GET', undefined, AbortSignal.timeout(10000));
      render(next);
      if (show || (!quiet && !next.configured)) open();
      return next.configured;
    } catch (error) {
      render(null, error.name === 'TimeoutError' ? 'The connection check timed out. Please try again.' : error.message);
      if (!quiet) open();
      return false;
    }
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
  document.querySelector('#api-close').addEventListener('click', () => finish(false));
  document.querySelector('#api-cancel').addEventListener('click', () => finish(false));
  done.addEventListener('click', () => finish(true));
  entry.addEventListener('click', () => { window.voice?.stop(); check({ show: true }); });
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    try { if (await check()) finish(true); } finally { retry.disabled = false; }
  });
  forget.addEventListener('click', async () => {
    forget.disabled = true;
    try { render(await request('DELETE', undefined, AbortSignal.timeout(10000))); input.focus(); }
    catch (error) { message.textContent = error.message; }
    finally { forget.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const key = input.value.trim();
    if (!key) { input.focus(); return; }
    operation = new AbortController();
    const active = operation;
    submit.disabled = true; input.disabled = true;
    submit.textContent = 'Checking…'; message.textContent = '';
    const timeout = setTimeout(() => active.abort(), 22000);
    try {
      await request('POST', { key }, active.signal);
      const saved = await request('GET', undefined, active.signal);
      if (!saved.configured) throw new Error('Your key was verified, but this browser didn’t retain the session. Enable cookies and try again.');
      render(saved);
      if (pending.length) finish(true);
      else done.focus();
    } catch (error) {
      if (dialog.open) message.textContent = error.name === 'AbortError' ? 'The request timed out. Please try again.' : error.message;
    } finally {
      clearTimeout(timeout); input.value = ''; input.disabled = false; submit.disabled = false; submit.textContent = 'Verify key';
      if (operation === active) operation = null;
    }
  });
  window.apiConnection = {
    async ensure() {
      if (await check()) return true;
      return new Promise(resolve => pending.push(resolve));
    },
  };
  window.addEventListener('pagehide', () => finish(false));
  check({ quiet: true });
})();
