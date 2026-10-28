import test from 'node:test';
import assert from 'node:assert/strict';
import {buildJourney,makePlan,targets,levels} from '../public/journey-core.js';
import {validateLearning,emptyLearning} from '../server/adaptive-review.js';
import {tutorInstructions,handleJourney} from '../server/journey.js';
import {saveAssessment} from '../server/save-assessment.js';
import {readRecords,writeRecords,handleLearning} from '../server/learning-storage.js';
import {database} from './helpers/database.js';
import {createLiveSession} from '../server/live-session.js';
import {reviewPractice} from '../server/practice-review.js';
const base=Date.UTC(2026,0,1),day=86400000;
const transcript=[{speaker:'teacher',text:'Как прошла поездка?'},{speaker:'user',text:'Я хотел поехать в Казань, но решил остаться дома.'},{speaker:'teacher',text:'Почему?'},{speaker:'user',text:'Потому что я хотел закончить важную работу.'}];
const observation=id=>({targetId:id,outcome:'independent',reason:'Explained and clarified independently.',quotes:[transcript[1].text,transcript[3].text]});
const session=(id,at,targetId,context='travel')=>({namespace:'sessions',id,value:{id,at,status:'applied',incomplete:false,transcript,assessment:{learning:{...emptyLearning(),context,observations:[observation(targetId)]}}}});
test('new learner starts unmeasured at B1 and no amount of flashcard ratings confers proficiency',()=>{
 const j=buildJourney([{namespace:'flashcards',id:'x',value:{card:{reps:999}}}],base);assert.equal(j.current,'B1');assert.equal(j.reviewedSessions,0);assert.ok(j.skills.every(s=>!s.mastered));assert.equal(j.calibration,true);
});
test('progression requires repeated independent evidence, time and context, and supports all four chapters',()=>{
 const records=[];
 for(let l=0;l<levels.length;l++){
  for(const t of targets.filter(t=>t.level===levels[l])){
   records.push(session(t.id+'1',base,t.id,'travel'),session(t.id+'2',base+day,t.id,'work'));
   assert.equal(buildJourney(records,base+3*day).skills.find(s=>s.id===t.id).mastered,false);
   records.push(session(t.id+'3',base+2*day,t.id,'travel'));
  }
  const j=buildJourney(records,base+3*day);assert.equal(j.chapters[l].complete,6);assert.equal(j.current,levels[Math.min(3,l+1)]);
 }
 assert.equal(buildJourney(records).chapters.every(c=>c.complete===6),true);
});
test('one context, one day, supported work and duplicate session evidence cannot establish an objective',()=>{
 for(const records of [
  [0,1,2].map(i=>session(String(i),base+i*day,'B1-interaction','travel')),
  [0,1,2].map(i=>session(String(i),base,'B1-interaction',i?'work':'travel')),
  [0,1,2].map(i=>session('same',base+i*day,'B1-interaction',i?'work':'travel')),
 ])assert.equal(buildJourney(records).skills[0].mastered,false);
 const records=[0,1,2].map(i=>session(String(i),base+i*day,'B1-interaction',i?'work':'travel'));records[2].value.assessment.learning.observations[0].outcome='supported';assert.equal(buildJourney(records).skills[0].mastered,false);
});
test('a later difficulty schedules retrieval without erasing established achievement; undo removes its evidence',()=>{
 const records=[0,1,2].map(i=>session(String(i),base+i*day,'B1-interaction',i?'work':'travel'));
 const failed=session('fail',base+3*day,'B1-interaction');failed.value.assessment.learning.observations[0].outcome='needs_practice';records.push(failed);
 let j=buildJourney(records,base+4*day);assert.equal(j.skills[0].mastered,true);assert.equal(j.skills[0].status,'Revisit');assert.equal(j.focus.id,'B1-interaction');
 records[2].value.status='undone';j=buildJourney(records,base+4*day);assert.equal(j.skills[0].mastered,false);
});
test('next lesson uses the weakest unobserved skill, with only adjacent-level stretch available',()=>{
 const j=buildJourney([session('s',base,'B1-interaction')],base+100);assert.notEqual(j.focus.id,'B1-interaction');
 assert.equal(makePlan(j,null,'C2-range').level,'B1');assert.equal(makePlan(j,null,'B2-range').level,'B2');
 const instructions=tutorInstructions(j,makePlan(j,null,'B2-range'));assert.match(instructions,/Working level B2/);assert.match(instructions,/PROFILE DATA/);
});
test('evidence validation rejects fabricated or teacher-only quotes, duplicate targets, and unelicited levels',()=>{
 const valid={...emptyLearning(),observations:[observation('B1-interaction')]};assert.equal(validateLearning(valid,{transcript},['B1-interaction']).version,1);
 for(const bad of [
  {...valid,observations:[{...valid.observations[0],quotes:['made up words','more made up words']}]},
  {...valid,observations:[{...valid.observations[0],targetId:'C2-range'}]},
  {...valid,observations:[valid.observations[0],valid.observations[0]]},
  {...valid,memories:[{category:'interest',text:'Likes travel',quote:transcript[0].text}]},
 ])assert.throws(()=>validateLearning(bad,{transcript},['B1-interaction']));
 assert.throws(()=>validateLearning(valid,{transcript:[{speaker:'user',text:transcript[1].text+' '+transcript[3].text}]},['B1-interaction']));
});
test('personal memory is sourced, can be suppressed, and does not become instruction text',()=>{
 const s=session('s',base,'B1-interaction');s.value.assessment.learning.memories=[{category:'interest',text:'Enjoys films',quote:transcript[1].text}];
 let j=buildJourney([s]);assert.equal(j.memories.length,1);assert.equal(j.memories[0].sessionId,'s');
 j=buildJourney([s,{namespace:'adaptive',id:'settings',value:{hiddenMemories:['enjoys films']}}]);assert.equal(j.memories.length,0);
 j=buildJourney([s,{namespace:'adaptive',id:'settings',value:{memory:false}}]);assert.equal(j.memories.length,0);
});
const origin='https://voice.example';
const req=(path,method='GET',body,user='alice')=>new Request(origin+path,{method,headers:{origin,'content-type':'application/json','oai-authenticated-user-id':user},...(body?{body:JSON.stringify(body)}:{})});
test('profile settings persist per account and enforce auth, origin, and field bounds',async t=>{
 const DB=await database(t),settings={action:'settings',goal:'Read literature',interests:'Cinema',minutes:20,corrections:'precise',memory:true};
 assert.equal((await handleJourney(req('/api/journey','GET',null,''),{DB})).status,401);
 assert.equal((await handleJourney(req('/api/journey','POST',{...settings,minutes:999}),{DB})).status,400);
 assert.equal((await handleJourney(req('/api/journey','POST',settings),{DB})).status,200);
 assert.equal((await (await handleJourney(req('/api/journey'),{DB})).json()).settings.goal,'Read literature');
 assert.notEqual((await (await handleJourney(req('/api/journey','GET',null,'bob'),{DB})).json()).settings.goal,'Read literature');
});
test('enriching historical sessions never replays old board updates and retrying remains idempotent',async t=>{
 const DB=await database(t),s={id:'old',at:base,mode:'talk',incomplete:false,transcript};
 const card={id:'skill',mode:'talk',stage:0,front:'Test'},result={summary:'Old summary',updates:[{id:'skill',outcome:'success',reason:'Test',quote:transcript[1].text}]};
 await saveAssessment(DB,'alice',s,result,[card]);await saveAssessment(DB,'alice',s,{...result,learning:{...emptyLearning(),observations:[observation('B1-interaction')]}},[card]);await saveAssessment(DB,'alice',s,result,[card]);
 const rows=await readRecords(DB,'alice');assert.equal(rows.find(r=>r.id==='skill').value.stage,1);assert.equal(buildJourney(rows).reviewedSessions,1);
});
test('browser sync cannot inject or replace server-generated adaptive evidence',async t=>{
 const DB=await database(t);const fake=session('fake',base,'C2-range').value;
 const change={id:'sync1',userId:'alice',mode:'update',changes:[{namespace:'sessions',id:'fake',value:fake}]};
 assert.equal((await handleLearning(req('/api/learning','POST',change),{DB})).status,200);
 assert.equal(buildJourney(await readRecords(DB,'alice')).reviewedSessions,0);
 await saveAssessment(DB,'alice',{id:'real',at:base,mode:'talk',incomplete:false,transcript},{summary:'Saved',updates:[],learning:{...emptyLearning(),observations:[observation('B1-interaction')]}},[]);
 change.id='sync2';change.changes=[{namespace:'sessions',id:'real',value:{...fake,id:'real',status:'undone'}}];
 await handleLearning(req('/api/learning','POST',change),{DB});const saved=(await readRecords(DB,'alice')).find(r=>r.id==='real').value;
 assert.equal(saved.assessment.learning.observations[0].targetId,'B1-interaction');assert.equal(saved.status,'undone');assert.equal(buildJourney(await readRecords(DB,'alice')).reviewedSessions,0);
});
test('a completed review changes the saved profile and the next tutor session, using the existing server key',async t=>{
 const DB=await database(t),env={DB,OPENAI_API_KEY:'sk-test-existing-key'},sdp='v=0\r\n';
 const start=await createLiveSession(req('/api/live/session','POST',{sdp}),env,{fetcher:async()=>Response.json({session:{id:'adaptive-live'},transport:{sdp}})});
 assert.equal(start.status,201);
 const memory={category:'goal',text:'Wants to finish important work',quote:transcript[3].text};
 const result={summary:'Explained a change of plan.',updates:[],learning:{...emptyLearning(),context:'travel',observations:[observation('B1-interaction')],memories:[memory]}};
 const reviewed=await reviewPractice(req('/api/practice/review','POST',{id:'adaptive-live',mode:'talk',at:base,incomplete:false,transcript}),env,{fetcher:async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer sk-test-existing-key');
  assert.match(JSON.parse(options.body).instructions,/B1-interaction/);
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});
 }});
 assert.equal(reviewed.status,200);
 const j=await (await handleJourney(req('/api/journey'),env)).json();
 assert.equal(j.reviewedSessions,1);assert.equal(j.memories[0].quote,transcript[3].text);assert.equal(j.skills[0].successes,1);assert.equal(j.plan.focus.id,'B1-accuracy');
 assert.ok(j.skills[0].lastAt>base); // Trusted session time wins over the client's backdated value.
 let instructions;
 const next=await createLiveSession(req('/api/live/session','POST',{sdp}),env,{fetcher:async(url,options)=>{instructions=JSON.parse(options.body).session.instructions;return Response.json({session:{id:'adaptive-next'},transport:{sdp}});}});
 assert.equal(next.status,201);assert.match(instructions,/Wants to finish important work/);assert.match(instructions,/Make everyday grammar reliable/);
});
test('recent discussion context is bounded, excludes undone work, and does not promote mastery',()=>{
 const records=Array.from({length:8},(_,i)=>{const r=session('recent'+i,base+i*day,'B1-interaction');r.value.summary='Film discussion '+i+'x'.repeat(600);return r;});
 records[7].value.status='undone';
 const journey=buildJourney(records,base+9*day);
 assert.equal(journey.recentDiscussions.length,5);
 assert.equal(journey.recentDiscussions[0].at,base+6*day);
 assert.ok(journey.recentDiscussions.every(s=>s.summary.length<=500));
 assert.equal(journey.skills[0].mastered,false);
 const prompt=tutorInstructions(journey,makePlan(journey));
 assert.ok(prompt.includes('Film discussion 6'));assert.ok(!prompt.includes('Film discussion 7'));
});
