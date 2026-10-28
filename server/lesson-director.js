import {requestLanguage,learningUserId} from './language.js';
import {resolveCredential} from './api-connection.js';
import {readJourney,tutorInstructions} from './journey.js';
import {withConversationContext} from '../public/conversation-context.js';
import {directorProvider,validateMove} from './director-provider.js';

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export const directorEnabled=env=>env.VOICE_LESSON_DIRECTOR==='agents';
export const registerDirector=(db,userId,liveId,instructions)=>db.prepare('INSERT INTO lesson_directors (user_id,live_id,instructions,created_at) VALUES (?,?,?,?)').bind(userId,liveId,instructions,Date.now()).run();
const rowFor=(db,user,id)=>db.prepare('SELECT * FROM lesson_directors WHERE user_id=? AND live_id=?').bind(user,id).first();
const setStatus=(db,user,id,status)=>db.prepare('UPDATE lesson_directors SET status=? WHERE user_id=? AND live_id=?').bind(status,user,id).run();
async function closeDirector(db,user,id,provider){
 await setStatus(db,user,id,'closed');
 const row=await rowFor(db,user,id);
 if(row.agent_id){
  try{await provider.close(row.agent_id);}
  catch{return false;}
 }
 await db.prepare('UPDATE lesson_directors SET agent_id=NULL,instructions=\'\',result=NULL WHERE user_id=? AND live_id=?').bind(user,id).run();
 return true;
}

// Recover interrupted tab cleanup on a later lesson. No external scheduler is
// assumed: abandoned lessons are cleaned up when this account uses Voice again.
export async function cleanupOldDirectors(db,user,provider){
 const rows=await db.prepare("SELECT live_id FROM lesson_directors WHERE user_id=? AND agent_id IS NOT NULL AND (status='closed' OR created_at<?) LIMIT 3").bind(user,Date.now()-4*3600000).all();
 for(const row of rows.results)await closeDirector(db,user,row.live_id,provider);
}

export async function handleDirector(request,env,{providerFactory=directorProvider}={}){
 const user=request.headers.get('oai-authenticated-user-id');
 if(!user)return json({error:'Sign in to use your lesson director.'},401);
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Reopen Voice and try again.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Expected JSON.'},415);
 let language,body;
 try{
  language=requestLanguage(request);
  const reader=request.body?.getReader();if(!reader)throw Error();
  let size=0,text='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>40000){await reader.cancel();return json({error:'Lesson context too large.'},413);}text+=decoder.decode(value,{stream:true});}
  body=JSON.parse(text+decoder.decode());
  if(typeof body?.sessionId!=='string'||!body.sessionId||body.sessionId.length>200||!['move','close'].includes(body.action))throw Error();
  if(body.action==='move'){
   if(typeof body.delegationId!=='string'||!body.delegationId||body.delegationId.length>200||!Number.isSafeInteger(body.revision)||body.revision<1||!Array.isArray(body.context)||!body.context.length)throw Error();
   withConversationContext({instructions:''},body.context,language);
  }
 }catch{return json({error:'Invalid lesson request.'},400);}
 if(!env.DB)return json({error:'Learning history is unavailable.'},503);
 const storageUser=learningUserId(user,language),id=body.sessionId;
 let row,provider;
 try{
  row=await rowFor(env.DB,storageUser,id);
  if(!row)return json({error:'Lesson not found.'},404);
  const credential=await resolveCredential(request,env,user);
  if(!credential)return json({error:'Reconnect your API key.',code:'key_required'},401);
  provider=providerFactory(credential.key);
  if(body.action==='close')return json({closed:true,cleanupPending:!await closeDirector(env.DB,storageUser,id,provider)});
  if(!row.calls)await cleanupOldDirectors(env.DB,storageUser,provider);
  if(!directorEnabled(env)||row.status==='closed'||Date.now()-row.created_at>4*3600000)return json({error:'Start a new voice lesson.'},409);
  if(row.status==='idle'&&row.delegation_id===body.delegationId&&row.revision===body.revision&&row.result)return json(JSON.parse(row.result));
  if(row.status!=='idle'||body.revision<=row.revision)return json({error:'Lesson has newer or unfinished work. Start a new lesson if this persists.'},409);
  if(row.calls>=60)return json({error:'This lesson reached its director limit. Start a new lesson.'},429);
  // One writer per account/language/Live session, across Worker isolates.
  const lock=await env.DB.prepare("UPDATE lesson_directors SET status='busy',revision=?,delegation_id=?,result=NULL,calls=calls+1 WHERE user_id=? AND live_id=? AND status='idle' AND revision<?").bind(body.revision,body.delegationId,storageUser,id,body.revision).run();
  if(!lock.meta.changes)return json({error:'A lesson decision is already running.'},409);
  const planRow=await env.DB.prepare("SELECT value FROM learning_records WHERE user_id=? AND namespace='adaptive' AND id=?").bind(storageUser,'plan:'+id).first();
  if(!planRow)throw Error('Missing trusted plan');
  const journey=await readJourney(env.DB,user,language),plan=JSON.parse(planRow.value);
  const input=JSON.stringify({revision:body.revision,language,mode:plan.mode,currentProfile:tutorInstructions(journey,plan),transcript:body.context,note:'Latest snapshot supersedes prior snapshots. Produce one next teaching move for the latest request; do not repeat an already answered question. Personal memories omitted from this snapshot must not be reused.'});
  const result=await provider.run({sessionId:row.agent_id,instructions:row.instructions,input,submissionKey:id+':'+body.revision,onSession:async agentId=>{
   await env.DB.prepare('UPDATE lesson_directors SET agent_id=? WHERE user_id=? AND live_id=?').bind(agentId,storageUser,id).run();
   if((await rowFor(env.DB,storageUser,id)).status==='closed')throw Error('Lesson closed during startup');
  }});
  const move=validateMove(JSON.stringify(result));
  const response={delegationId:body.delegationId,revision:body.revision,...move};
  const saved=await env.DB.prepare("UPDATE lesson_directors SET status='idle',result=? WHERE user_id=? AND live_id=? AND status='busy' AND revision=?").bind(JSON.stringify(response),storageUser,id,body.revision).run();
  if(!saved.meta.changes){await closeDirector(env.DB,storageUser,id,provider);return json({error:'Lesson ended before this result.'},409);}
  return json(response);
 }catch(error){
  if(row&&provider){
   // Never resend input after an ambiguous stream failure. Cancel and delete;
   // a fresh Live lesson is required. Keep the ID when deletion needs a retry.
   try{
    if(error.directorSessionId)await env.DB.prepare('UPDATE lesson_directors SET agent_id=? WHERE user_id=? AND live_id=?').bind(error.directorSessionId,storageUser,id).run();
    await closeDirector(env.DB,storageUser,id,provider);
   }catch{
    // If storage itself failed, still attempt to stop known provider work.
    if(error.directorSessionId)try{await provider.close(error.directorSessionId);}catch{console.warn('director_cleanup_pending',error.directorSessionId);}
   }
  }
  return json({error:'The lesson director could not complete this turn. Continue with the voice teacher or start a new lesson.',directorUnavailable:true},502);
 }
}
