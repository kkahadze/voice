import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './helpers/database.js';
import {handleLearning,readRecords,readSnapshot,writeRecords} from '../server/learning-storage.js';
import {saveAssessment} from '../server/save-assessment.js';
import {splitState,joinState,changedRecords} from '../public/sync-data.js';

const origin='https://voice.example';
const req=(method='GET',body,extra={})=>new Request(origin+'/api/learning',{method,headers:{'oai-authenticated-user-id':'alice',origin,'content-type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
const event=(id,changes,mode='update')=>({id,userId:'alice',mode,changes});
const card=(id,value)=>({namespace:'flashcards',id,value});


test('authenticated server records isolate accounts, reject foreign writes and untrusted origins',async t=>{
  const DB=await database(t);
  assert.equal((await handleLearning(req('GET',null,{'oai-authenticated-user-id':''}),{DB})).status,401);
  assert.equal((await handleLearning(req('POST',event('x',[card('one',{})]),{origin:'https://other.example'}),{DB})).status,403);
  assert.equal((await handleLearning(req('POST',{...event('x',[card('one',{})]),userId:'bob'}),{DB})).status,409);
  assert.equal((await handleLearning(req('POST',event('x',[{namespace:'secrets',id:'key',value:'no'}])),{DB})).status,400);
  assert.equal((await handleLearning(req('POST',event('x',[card('one',{familiarUntil:60})])),{DB})).status,200);
  const alice=await (await handleLearning(req(),{DB})).json();assert.equal(alice.records.length,1);
  const bob=await (await handleLearning(req('GET',null,{'oai-authenticated-user-id':'bob'}),{DB})).json();assert.equal(bob.records.length,0);
});

test('device updates merge by record, imports preserve server state and retries cannot replay stale edits',async t=>{
  const db=await database(t);
  await writeRecords(db,'alice',event('first',[card('one',{reps:1})]));
  await writeRecords(db,'alice',event('newer',[card('one',{reps:2}),card('two',{reps:3})]));
  await writeRecords(db,'alice',event('first',[card('one',{reps:1})]));
  await writeRecords(db,'alice',event('import',[card('one',{reps:0}),card('three',{reps:4})],'import'));
  let rows=await readRecords(db,'alice');assert.equal(rows.find(r=>r.id==='one').value.reps,2);assert.equal(rows.length,3);
  await writeRecords(db,'alice',event('undo',[card('one',null)]));
  await writeRecords(db,'alice',event('old-device',[card('one',{reps:1})],'import'));
  rows=await readRecords(db,'alice');assert.equal(rows.find(r=>r.id==='one').value,null);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM learning_events WHERE user_id = ?').bind('alice').first()).n,5);
});

test('assessments are saved on the server once and concurrent sessions both advance the skill',async t=>{
  const db=await database(t),skill={id:'skill',mode:'talk',stage:0,front:'Ask for help'};
  const result={summary:'Good practice',updates:[{id:'skill',outcome:'success',quote:'Помогите',reason:'Asked independently'}]};
  const session=id=>({id,at:100,mode:'talk',incomplete:false,transcript:[{speaker:'user',text:'Помогите'}]});
  await Promise.all([saveAssessment(db,'alice',session('a'),result,[skill]),saveAssessment(db,'alice',session('b'),result,[skill])]);
  await saveAssessment(db,'alice',session('a'),result,[skill]);
  let rows=await readRecords(db,'alice');assert.equal(rows.find(r=>r.id==='skill').value.stage,2);
  assert.equal(rows.filter(r=>r.namespace==='sessions').length,2);
  await writeRecords(db,'alice',event('late-checkpoint',[{namespace:'sessions',id:'a',value:{...session('a'),status:'active'}}]));
  rows=await readRecords(db,'alice');assert.equal(rows.find(r=>r.namespace==='sessions'&&r.id==='a').value.status,'applied');
  const stale=await readSnapshot(db,'alice');await writeRecords(db,'alice',event('other-device',[card('new',{})]));
  assert.equal(await writeRecords(db,'alice',event('stale',[card('bad',{})]),Date.now(),stale.revision),false);
  assert.ok(!(await readRecords(db,'alice')).some(r=>r.id==='bad'));
});

test('conversation storage keeps more than 50 sessions and serializes all progress families',()=>{
  const data={version:2,cards:[{id:'s',stage:2}],sessions:Array.from({length:75},(_,i)=>({id:String(i),at:i,transcript:[{text:'Привет',speaker:'user'}]})),topicRecent:{talk:['s'],listen:[]}};
  const records=splitState('voice-practice-v2',JSON.stringify(data));
  const restored=JSON.parse(joinState(records)['voice-practice-v2']);assert.equal(restored.sessions.length,75);assert.equal(restored.sessions[0].id,'74');
  for(const [key,value] of [['voice-flashcards-fsrs-v2',{version:2,progress:{x:{card:{reps:1}}},options:{deck:'theme-food'}}],['voice-album-words-fsrs-v1',{a:{familiarUntil:99}}],['voice-music-understanding-v1',{a:'understood'}],['voice-lyric-meanings-v1',true]])assert.deepEqual(JSON.parse(joinState(splitState(key,JSON.stringify(value)))[key]),value);
  assert.deepEqual(changedRecords('voice-album-words-fsrs-v1','{"a":1,"b":2}','{"a":1,"b":3}'),[{namespace:'album',id:'b',value:3}]);
});

test('a second device imports practiced skills over unused defaults without replacing practiced server skills',async t=>{
  const db=await database(t);
  await writeRecords(db,'alice',event('defaults',[
    {namespace:'skills',id:'new',value:{id:'new',stage:0,reviews:0}},
    {namespace:'skills',id:'used',value:{id:'used',stage:1,reviews:2,lastReview:20}},
  ]));
  await writeRecords(db,'alice',event('phone-import',[
    {namespace:'skills',id:'new',value:{id:'new',stage:3,reviews:4,lastReview:10}},
    {namespace:'skills',id:'used',value:{id:'used',stage:3,reviews:4,lastReview:10}},
  ],'import'));
  const rows=await readRecords(db,'alice');
  assert.equal(rows.find(r=>r.id==='new').value.stage,3);
  assert.equal(rows.find(r=>r.id==='used').value.stage,1);
});

test('review retry returns its saved assessment without calling the model and missing storage fails closed',async t=>{
  const {reviewPractice}=await import('../server/practice-review.js');
  const DB=await database(t);
  const session={id:'done',mode:'talk',at:100,incomplete:false,transcript:[{speaker:'user',text:'Привет'}]};
  await saveAssessment(DB,'alice',session,{summary:'Saved review',updates:[]},[]);
  const request=()=>new Request(origin+'/api/practice/review',{method:'POST',headers:{'oai-authenticated-user-id':'alice',origin,'content-type':'application/json'},body:JSON.stringify(session)});
  const response=await reviewPractice(request(),{DB},{fetcher:()=>{throw Error('Must reuse the saved result');}});
  assert.equal(response.status,200);assert.equal((await response.json()).persisted,true);
  assert.equal((await reviewPractice(request(),{})).status,503);
});
