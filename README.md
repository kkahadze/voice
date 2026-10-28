# Voice

Minimal Russian learning app with browser-local learning boards.

Talk and Listen use a saved prompt-generated Russian tutor voice with GPT-Live.
The voice ID and original description are in `server/russian-voice.js`; its description
is included in the session instructions. Creation used the hosted OpenAI project,
so replacement API keys must have access to that voice. Start a new session after
changing the voice. Voice generation is not repeated on page loads or calls.

## Run

Use Node 22.13+ and `npm install`, then `npm run dev -- --port 4173`.
For preview authentication, visit `/signin-with-chatgpt?return_to=/` once.
The Sites platform supplies authenticated user identity in production.

## API setup

Set an optional server-side `OPENAI_API_KEY` in `.env.local` for local development
or in Sites runtime secrets for hosting. Local env files are not deployed.
The app checks this key before prompting. Without it, users can enter their own
key in the connection dialog. The backend verifies access to OpenAI's model-list
endpoint, encrypts the key in an HttpOnly cookie bound to the authenticated user,
and remembers it for one year, renewing it on return visits (at most daily).
Still-valid four-hour cookies upgrade automatically on the next connection check.
Set `API_SESSION_SECRET` to a random 32-byte base64 value as a server-side secret
and keep it stable across deployments. Never expose either variable in client code.

Key setup is also available from **Developer mode → API connection**.
No key is kept in localStorage or sessionStorage. “Forget key” clears the browser's
persistent cookie. Clearing cookies, using another browser, or rotating the server's
encryption secret requires entering the key again. Keys are not synced across devices.
API validation does not establish model permissions or billing availability beyond
the model-list request.

Source UI is in `ui/index.html` and `public/`. `dist/` is generated output.
Run `node --test server/api-connection.test.js` for credential-flow checks.


## Account learning storage

Learning records live in the Sites D1 `DB` binding, scoped by the trusted `oai-authenticated-user-id` header. `/api/learning` reads account records and accepts bounded, same-origin, idempotent update batches. Sessions, skill/topic progress, FSRS reviews, album reviews, and listening ratings sync on load, reconnect, focus and every 30 seconds while visible. The browser keeps an account-scoped cache and persistent upload queue for interrupted connections.

Each device imports its existing browser records on its next visit, retaining the original local backup. Imports fill missing records and unused skill defaults; existing practiced server records and deletion tombstones win. Completed assessments persist directly to D1 with optimistic revision checks and session deduplication before returning success. Partial voice transcripts checkpoint while a conversation is active. Session history is no longer trimmed to 50 records. A sync banner reports queued uploads or failures.

Run `node --test tests/*.test.js server/*.test.js` for account isolation, database transactions, duplicate retries, concurrent assessments, migration, and offline recovery coverage. No live model calls are made by these tests.

### Agents API lesson director (opt-in)

Apply the D1 migration `drizzle/0001_luxuriant_thena.sql` and set the server binding `VOICE_LESSON_DIRECTOR=agents` to use the director for new calls. Leave it unset to keep Responses delegation; switching requires a new voice call. The existing server key or encrypted user key is reused and must have Agents API read/write and model permissions. No key enters the browser or the hosted agent environment.

GPT-Live keeps handling speech. On client delegation the browser sends a bounded transcript snapshot to `/api/live/director`; the server loads the authenticated account's current learning profile and uses a single `gpt-6-luna` Agents API session with an OpenAI-hosted environment for that lesson. The director returns one short teaching move. User speech or a newer delegation invalidates older results, and only a matching result is returned to Live. The director cannot update mastery or learning records; completed-call review remains authoritative. Listening lessons include their passage and answer restrictions.

The server serializes turns in a separate, account-and-language-scoped D1 table, caches the latest successful submission, and blocks replay after ambiguous failures. It limits each call to 60 director requests and each model wait to 55 seconds, but has no hard dollar budget (the tested project rejects the API's `spend_control` field). A failed director is surfaced in the app and the voice teacher continues without further delegation for that call. No automatic Responses substitution occurs mid-call.

Hangup explicitly cancels and deletes the Agents session. Cleanup failures retain the provider ID for retry; the next director lesson retries up to three closed or four-hour-old sessions. A tab disappearing or never returning can leave a hosted session pending cleanup, so a production rollout should monitor this table and use an operator cleanup sweep. Agents sessions are separate retained API state until deleted; this opt-in changes retention compared with using only the app's database. No deployment or feature flag is enabled by committing this code.

For an opt-in, paid two-turn smoke check using synthetic Spanish dialogue, run `node scripts/check-lesson-director.mjs` with the existing `OPENAI_API_KEY` in the process environment. It prints the moves, latency, and cleanup outcome without credentials. Test real spoken output, interruption timing, and latency before enabling this broadly: API success and mock WebRTC tests do not establish voice quality.
