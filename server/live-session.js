import {directorEnabled,registerDirector} from './lesson-director.js';
import {requestLanguage,learningUserId} from './language.js';
import {curriculaForLanguage} from './curricula.js';
import {targetsForLanguage,levels} from '../public/journey-core.js';
import {readJourney,makePlan,tutorInstructions} from './journey.js';
import {writeRecords} from './learning-storage.js';
import {withConversationContext} from '../public/conversation-context.js';
import { resolveCredential } from './api-connection.js';
import { configForMode } from './listen-config.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function createLiveSession(request, env, { fetcher = fetch } = {}) {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId) return json({ error: 'Sign in to this app, then try again.' }, 401);
  let language;try{language=requestLanguage(request);}catch{return json({error:'Choose Russian or Spanish.'},400);}
  const storageUser=learningUserId(userId,language);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Please reopen this app and try again.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Expected an audio connection request.' }, 415);
  if (Number(request.headers.get('content-length')) > 65536) return json({ error: 'Audio connection request is too large.' }, 413);
  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) { await reader.cancel(); return json({ error: 'Audio connection request is too large.' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return json({ error: 'Invalid audio connection request.' }, 400); }
  if (typeof body?.sdp !== 'string' || !body.sdp.startsWith('v=0') || body.sdp.length > 60000) return json({ error: 'Invalid audio connection offer.' }, 400);
  if(body.language!==undefined&&body.language!==language)return json({error:'This conversation belongs to another language.'},400);
  let config;try { config=withConversationContext(configForMode(body.mode||'talk',body.lessonId,body.topicId,language),body.context,language); } catch { return json({error:'Choose a valid practice mode and listening exercise.'},400); }
  if(!env.DB)return json({error:'Your learning profile is unavailable. Please retry shortly.'},503);
  const useDirector=directorEnabled(env);
  const directorInstructions=config.delegation.responses.instructions;
  let plan;
  try {
    if(useDirector)await env.DB.prepare('SELECT live_id FROM lesson_directors LIMIT 0').all();
    const journey=await readJourney(env.DB,userId,language);
    plan={...makePlan(journey,body.topicId,body.targetId),language,mode:body.mode||'talk',at:Date.now()};
    if(body.mode==='listen'){
      const lesson=curriculaForLanguage(language).listen.find(c=>c.id===body.lessonId);
      const level=levels.includes(lesson?.level)?lesson.level:journey.current;
      const focus=targetsForLanguage(language).find(t=>t.id===level+'-interpretation');
      plan={...plan,level,lessonId:body.lessonId||null,targetIds:[focus.id],focus,review:null};
    }
    const adaptive=tutorInstructions(journey,plan);
    config={...config,instructions:config.instructions+adaptive,delegation:{...config.delegation,responses:{...config.delegation.responses,instructions:config.delegation.responses.instructions+adaptive}}};
  }catch{return json({error:'Could not load your learning profile. Please retry.'},503);}
  if(useDirector)config={...config,delegation:{type:'client'}};
  const credential = await resolveCredential(request, env, userId);
  if (!credential) return json({ error: 'Add your API key to start talking.', code: 'key_required' }, 401);

  let response;
  try {
    response = await fetcher('https://api.openai.com/v1/live/sessions', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${credential.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: config, transport: { type: 'webrtc', sdp: body.sdp } }),
    });
  } catch {
    return json({ error: 'The voice connection timed out or was interrupted. Finalization could not be confirmed.', incomplete: true }, 502);
  }
  let result;
  try { result = await response.json(); } catch { result = null; }
  if (!response.ok) {
    // Never forward provider messages, which can contain credential fragments.
    if (response.status === 401) return json({ error: 'OpenAI rejected this API key. Update it in API connection.', code: 'key_required' }, 401);
    if (response.status === 403 || response.status === 404) return json({ error: 'This OpenAI project does not have access to the requested voice model. Check GPT-Live access and key permissions.' }, 403);
    if (response.status === 429) return json({ error: result?.error?.code === 'insufficient_quota' ? 'Your OpenAI project has no available API credit. Check its billing and usage limits.' : 'OpenAI is limiting voice requests. Wait a moment and try again.' }, 429);
    if (response.status === 400) return json({ error: 'OpenAI could not start the requested voice configuration. Check model and voice availability for this project.' }, 400);
    return json({ error: 'OpenAI could not start the voice session. Please try again.' }, 502);
  }
  if (typeof result?.session?.id !== 'string' || !result.session.id || typeof result?.transport?.sdp !== 'string' || !result.transport.sdp.startsWith('v=0')) {
    return json({ error: 'The voice connection response was incomplete. Finalization could not be confirmed.', incomplete: true }, 502);
  }
  try{if(useDirector)await registerDirector(env.DB,storageUser,result.session.id,directorInstructions);await writeRecords(env.DB,storageUser,{id:'plan:'+result.session.id,mode:'update',changes:[{namespace:'adaptive',id:'plan:'+result.session.id,value:plan}]});}catch{return json({error:'Could not save the lesson plan. Please reconnect.'},503);}
  // Return only negotiation data; no credentials or full provider payloads.
  return json({ ...(useDirector?{director:true}:{}),session: { id: result.session.id }, transport: { type: 'webrtc', sdp: result.transport.sdp } }, 201);
}
