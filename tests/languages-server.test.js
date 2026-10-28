import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './helpers/database.js';
import {requestLanguage,learningUserId} from '../server/language.js';
import {handleLearning,readRecords,writeRecords} from '../server/learning-storage.js';
import {handleJourney} from '../server/journey.js';
import {createLiveSession} from '../server/live-session.js';
import {reviewPractice} from '../server/practice-review.js';
import {handleConnection} from '../server/api-connection.js';
import {configForMode} from '../server/listen-config.js';
import {emptyLearning} from '../server/adaptive-review.js';
import {withConversationContext} from '../public/conversation-context.js';
import {buildJourney,targetsForLanguage,makePlan} from '../public/journey-core.js';
import {spanishListenCurriculum,spanishTopicCurriculum,spanishTalkCurriculum} from '../public/spanish-curriculum.js';
import {talkCurriculum} from '../public/talk-curriculum.js';
const origin='https://voice.example',sdp='v=0\r\n',key='sk-test-not-a-real-key-1234567890';
const req=(path,language='ru',body,user='alice')=>new Request(origin+path+(language===null?'':'?language='+language),{method:body?'POST':'GET',headers:{origin,'content-type':'application/json','oai-authenticated-user-id':user},...(body?{body:JSON.stringify(body)}:{})});
const update=(id,changes,language='ru')=>({id,mode:'update',userId:'alice',language,changes});
const spanishTurns=[{speaker:'teacher',text:'¿Por qué cambiaste de planes?'},{speaker:'user',text:'Quería ir a la montaña, pero empezó a llover.'},{speaker:'teacher',text:'¿Qué hiciste después?'},{speaker:'user',text:'Decidí visitar un museo porque me gusta la historia.'}];
test('language selection defaults to Russian and rejects unsupported or ambiguous language codes',async t=>{
 const DB=await database(t),env={DB,OPENAI_API_KEY:key};
 assert.equal(requestLanguage(req('/api/journey',null)),'ru');assert.equal(requestLanguage(req('/api/journey','es')),'es');
 assert.throws(()=>requestLanguage(new Request(origin+'/?language=ru&language=es')));
 for(const [handler,path,body] of [[handleLearning,'/api/learning'],[handleJourney,'/api/journey'],[handleConnection,'/api/connection'],[createLiveSession,'/api/live/session',{sdp}],[reviewPractice,'/api/practice/review',{id:'x',mode:'talk',incomplete:false,transcript:spanishTurns}]])assert.equal((await handler(req(path,'fr',body),env)).status,400);
});
test('malformed session payloads return a validation error without dereferencing a language field',async()=>{
 for(const body of [null,[],42,'es',true])for(const [handler,path] of [[createLiveSession,'/api/live/session'],[reviewPractice,'/api/practice/review']]){
  const request=new Request(origin+path+'?language=es',{method:'POST',headers:{origin,'content-type':'application/json','oai-authenticated-user-id':'alice'},body:JSON.stringify(body)});
  assert.equal((await handler(request,{})).status,400);
 }
});
test('same-account Russian and Spanish data, events, settings and history are isolated',async t=>{
 const DB=await database(t),env={DB};
 for(const [language,stage] of [['ru',2],['es',4]]){
  const response=await handleLearning(req('/api/learning',language,update('same-event',[{namespace:'flashcards',id:'same-card',value:{stage}},{namespace:'sessions',id:'same-session',value:{id:'same-session',language,status:'pending',at:1,incomplete:false,transcript:spanishTurns}}],language)),env);
  assert.equal(response.status,200);
  const settings={action:'settings',goal:language==='es'?'Visit museums in Spanish':'Russian literature',interests:language==='es'?'Historia':'Poetry',minutes:15,corrections:'balanced',memory:true};
  assert.equal((await handleJourney(req('/api/journey',language,settings),env)).status,200);
 }
 for(const [language,stage,goal] of [['ru',2,'Russian literature'],['es',4,'Visit museums in Spanish']]){
  const cloud=await (await handleLearning(req('/api/learning',language),env)).json();
  assert.equal(cloud.userId,'alice');assert.equal(cloud.language,language);assert.equal(cloud.records.find(r=>r.id==='same-card').value.stage,stage);assert.equal(cloud.records.find(r=>r.id==='same-session').value.language,language);
  const journey=await (await handleJourney(req('/api/journey',language),env)).json();assert.equal(journey.settings.goal,goal);assert.equal(journey.pendingReviews.length,1);
 }
 const bob=await (await handleLearning(req('/api/learning','es',undefined,'bob'),env)).json();assert.equal(bob.records.length,0);
 assert.equal((await readRecords(DB,'alice')).find(r=>r.id==='same-card').value.stage,2);
 assert.equal((await readRecords(DB,learningUserId('alice','es'))).find(r=>r.id==='same-card').value.stage,4);
 assert.equal((await handleLearning(req('/api/learning','es',update('wrong-language',[{namespace:'flashcards',id:'x',value:{}}],'ru')),env)).status,409);
});
test('Spanish journey uses Spanish activities and grammar without inheriting Russian profile defaults',()=>{
 const j=buildJourney([],undefined,'es'),plan=makePlan(j);
 assert.equal(j.language,'es');assert.match(j.settings.goal,/Spanish/);assert.equal(plan.language,'es');assert.equal(j.skills.length,24);
 assert.ok(j.skills.every(s=>!/[\u0400-\u04ff]/.test(s.task)));assert.match(j.skills.find(s=>s.id==='B1-accuracy').criterion,/ser or estar/);assert.match(j.skills.find(s=>s.id==='B2-accuracy').criterion,/subjunctive/);
 assert.match(targetsForLanguage()[0].task,/[\u0400-\u04ff]/);assert.equal(j.reviewedSessions,0);
});
test('Spanish live sessions and continuation use Spanish prompts and the existing credential',async t=>{
 const DB=await database(t);let sent;
 const result=await createLiveSession(req('/api/live/session','es',{sdp,language:'es',context:spanishTurns}),{DB,OPENAI_API_KEY:key},{fetcher:async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer '+key);sent=JSON.parse(options.body).session;return Response.json({session:{id:'es-live'},transport:{sdp}});
 }});
 assert.equal(result.status,201);assert.match(sent.instructions,/profesor de español/);assert.match(sent.instructions,/CONTINUACIÓN/);assert.match(sent.instructions,/ADAPTIVE SPANISH LESSON/);assert.doesNotMatch(sent.instructions,/[\u0400-\u04ff]/);assert.doesNotMatch(sent.delegation.responses.instructions,/[\u0400-\u04ff]/);
 const plans=await readRecords(DB,learningUserId('alice','es'));assert.equal(plans.find(r=>r.id==='plan:es-live').value.language,'es');assert.equal((await readRecords(DB,'alice')).length,0);
 const wrong=await createLiveSession(req('/api/live/session','es',{sdp,language:'ru'}),{DB,OPENAI_API_KEY:key});assert.equal(wrong.status,400);
 const esTopic=spanishTopicCurriculum.find(t=>t.mode==='talk');assert.ok(configForMode('talk',undefined,esTopic.id,'es').instructions.includes(esTopic.prompt));
 assert.throws(()=>configForMode('talk',undefined,esTopic.id,'ru'));
 assert.doesNotMatch(withConversationContext({instructions:'Tutor'},spanishTurns,'es').instructions,/[\u0400-\u04ff]/);
});
test('Spanish listening preserves the selected passage and plans comprehension at its level',async t=>{
 const DB=await database(t),lesson=spanishListenCurriculum.find(c=>c.level==='C1');let sent;
 const response=await createLiveSession(req('/api/live/session','es',{sdp,mode:'listen',lessonId:lesson.id}),{DB,OPENAI_API_KEY:key},{fetcher:async(url,options)=>{sent=JSON.parse(options.body).session.instructions;return Response.json({session:{id:'es-listen-live'},transport:{sdp}});}});
 assert.equal(response.status,201);assert.ok(sent.includes(lesson.script));assert.ok(sent.includes(lesson.question));assert.match(sent,/selected listening passage/);assert.doesNotMatch(sent,/Starting activity/);
 const plan=(await readRecords(DB,learningUserId('alice','es'))).find(r=>r.id==='plan:es-listen-live').value;assert.equal(plan.level,'C1');assert.deepEqual(plan.targetIds,['C1-interpretation']);
});
test('Spanish reviews update only Spanish skills and memories; Russian IDs and mismatched sessions are rejected',async t=>{
 const DB=await database(t),env={DB,OPENAI_API_KEY:key},id='es-reviewed';
 const learning={...emptyLearning(),context:'culture',observations:[{targetId:'B1-interaction',outcome:'independent',reason:'Explained and expanded independently.',quotes:[spanishTurns[1].text,spanishTurns[3].text]}],memories:[{category:'interest',text:'Enjoys history',quote:spanishTurns[3].text}]};
 const result={summary:'Explained a change of plan.',updates:[{id:spanishTalkCurriculum[0].id,outcome:'success',reason:'Completed the task.',quote:spanishTurns[1].text}],learning};
 const body={id,mode:'talk',language:'es',at:Date.now(),incomplete:false,transcript:spanishTurns};let calls=0;
 const options={fetcher:async(url,opts)=>{calls++;const instructions=JSON.parse(opts.body).instructions;assert.match(instructions,/Spanish learner/);assert.match(instructions,/corrected Spanish example/);assert.doesNotMatch(instructions,/[\u0400-\u04ff]/);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});}};
 assert.equal((await reviewPractice(req('/api/practice/review','es',body),env,options)).status,200);
 assert.equal((await reviewPractice(req('/api/practice/review','es',body),env,options)).status,200);assert.equal(calls,1);
 const es=await (await handleJourney(req('/api/journey','es'),env)).json(),ru=await (await handleJourney(req('/api/journey','ru'),env)).json();assert.equal(es.reviewedSessions,1);assert.equal(es.memories[0].text,'Enjoys history');assert.equal(ru.reviewedSessions,0);assert.equal(ru.memories.length,0);
 assert.equal((await reviewPractice(req('/api/practice/review','ru',body),env,options)).status,400);
 result.updates[0].id=talkCurriculum[0].id;assert.equal((await reviewPractice(req('/api/practice/review','es',{...body,id:'bad-grade'}),env,options)).status,502);
});
test('revealing a Spanish listening transcript never advances listening evidence',async t=>{
 const DB=await database(t);const lesson=spanishListenCurriculum[0];
 const response=await reviewPractice(req('/api/practice/review','es',{id:'shown-script',mode:'listen',language:'es',lessonId:lesson.id,at:Date.now(),incomplete:false,transcript:spanishTurns,transcriptRevealed:true}),{DB,OPENAI_API_KEY:key},{fetcher:async()=>{throw Error('Should not call model');}});
 assert.equal(response.status,200);const result=await response.json();assert.deepEqual(result.updates,[]);assert.deepEqual(result.learning.observations,[]);
});
