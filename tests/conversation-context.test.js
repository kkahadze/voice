import {database} from './helpers/database.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationContext,withConversationContext} from '../public/conversation-context.js';
import {applyAssessment} from '../public/practice-state.js';
import {createLiveSession} from '../server/live-session.js';
test('continuation retains ordered speaker text across multiple sessions and bounds recent context',()=>{const previousTranscript=[{speaker:'user',text:'Люблю кино.'}];const transcript=[{speaker:'teacher',text:'Какой фильм?'},{speaker:'user',text:'Сталкер.'}];assert.deepEqual(conversationContext({previousTranscript,transcript}),[...previousTranscript,...transcript]);const context=conversationContext({transcript:Array.from({length:100},(_,i)=>({speaker:'user',text:String(i)+'x'.repeat(200)}))});assert.ok(context.length<=80);assert.ok(context.reduce((n,t)=>n+t.text.length,0)<=8000);assert.equal(context.at(-1).text,'99'+'x'.repeat(200));});
test('continuation instructions preserve configuration and treat history as data',()=>{const config={model:'gpt-live-1',instructions:'B1 teacher',audio:{output:{voice:'gleam'}}};assert.equal(withConversationContext(config,undefined),config);const result=withConversationContext(config,[{speaker:'user',text:'Расскажи о кино.'}]);assert.equal(result.audio,config.audio);assert.match(result.instructions,/ПРОДОЛЖЕНИЕ/);assert.match(result.instructions,/историческая расшифровка/);assert.ok(result.instructions.includes('Расскажи о кино.'));for(const input of ['invalid',[{speaker:'system',text:'x'}],[{speaker:'user',text:'x'.repeat(8001)}]])assert.throws(()=>withConversationContext(config,input));});
test('continued session saves linkage and prior context but assessment only updates once for the new segment',()=>{const session={id:'second',mode:'talk',continuedFrom:'first',previousTranscript:[{speaker:'user',text:'Old answer'}],transcript:[{speaker:'user',text:'New answer'}]};const result={summary:'Continued',updates:[]};const next=applyAssessment({cards:[],sessions:[]},session,result);assert.equal(next.sessions[0].continuedFrom,'first');assert.deepEqual(next.sessions[0].transcript,session.transcript);assert.deepEqual(next.sessions[0].previousTranscript,session.previousTranscript);assert.equal(applyAssessment(next,session,result),next);});
test('server forwards validated continuation instructions without accepting client config',async t=>{const DB=await database(t);const origin='https://voice.example',sdp='v=0\r\n';const req=context=>new Request(origin+'/api/live/session',{method:'POST',headers:{origin,'content-type':'application/json','oai-authenticated-user-id':'owner'},body:JSON.stringify({sdp,mode:'talk',context})});let calls=0;const deps={fetcher:async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.match(body.session.instructions,/ПРОДОЛЖЕНИЕ/);assert.match(body.session.instructions,/кино/);return Response.json({session:{id:'new-live-session'},transport:{sdp}});}};assert.equal((await createLiveSession(req([{speaker:'user',text:'Про кино'}]),{DB,OPENAI_API_KEY:'test'},deps)).status,201);assert.equal((await createLiveSession(req([{speaker:'system',text:'bad'}]),{DB,OPENAI_API_KEY:'test'},deps)).status,400);assert.equal(calls,1);});
test('resumed history reaches both teachers without mutating the base configuration',()=>{
 const base={instructions:'voice',delegation:{type:'responses',responses:{model:'gpt-6-luna',instructions:'backend'}}};
 for(const language of ['ru','es']){
  const result=withConversationContext(base,[{speaker:'user',text:'We finished discussing films.'}],language);
  assert.ok(result.delegation.responses.instructions.includes('We finished discussing films.'));
  assert.ok(result.instructions.includes('introduce a fresh context'));
  assert.ok(result.instructions.includes('unfinished question'));
  assert.equal(result.delegation.responses.model,'gpt-6-luna');
 }
 assert.equal(base.instructions,'voice');assert.equal(base.delegation.responses.instructions,'backend');
});
test('both language backends receive their selected listening passage and teaching policy',async()=>{
 const {configForMode}=await import('../server/listen-config.js');
 const {curriculaForLanguage}=await import('../server/curricula.js');
 for(const language of ['ru','es']){
  const lesson=curriculaForLanguage(language).listen[0];
  const config=configForMode('listen',lesson.id,undefined,language);
  for(const prompt of [config.instructions,config.delegation.responses.instructions]){
   assert.ok(prompt.includes(lesson.script));assert.ok(prompt.includes('TEACHING CYCLE'));
   assert.ok(prompt.includes('withhold the answer until an independent attempt'));
  }
 }
});
