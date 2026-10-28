import test from 'node:test';
import assert from 'node:assert/strict';

test('browser imports once, uploads offline edits, hydrates remote changes, and does not leak legacy history to another account',async t=>{
  const originals=Object.fromEntries(['window','document','localStorage','fetch','setInterval'].map(k=>[k,globalThis[k]]));
  t.after(()=>{for(const [k,v] of Object.entries(originals))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
  const storage=new Map([['voice-flashcards-fsrs-v2',JSON.stringify({version:2,progress:{old:{familiarUntil:99}},options:{deck:'common'}})]]);
  globalThis.localStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  globalThis.window=new EventTarget();
  globalThis.document=Object.assign(new EventTarget(),{hidden:false,querySelector:()=>null});
  globalThis.setInterval=()=>0;
  let owner='alice',offline=false,loseResponse=false;
  const records=new Map(),events=new Set();
  globalThis.fetch=async(_url,options)=>{
    if(offline)throw Error('Offline');
    if(options.method==='GET')return Response.json({userId:owner,records:[...records.values()].filter(r=>r.owner===owner).map(({owner,...r})=>r)});
    const event=JSON.parse(options.body);
    if(event.userId!==owner)return Response.json({error:'Account changed'},{status:409});
    const eventKey=owner+event.id;
    if(!events.has(eventKey))for(const c of event.changes){const key=JSON.stringify([owner,c.namespace,c.id]);if(event.mode!=='import'||!records.has(key))records.set(key,{...c,owner});}
    events.add(eventKey);
    if(loseResponse){loseResponse=false;throw Error('Response lost');}
    return Response.json({saved:true});
  };
  const client=await import('../public/cloud-store.js?client-test-alice');await client.cloudReady;
  const key='voice-flashcards-fsrs-v2';
  assert.equal(JSON.parse(client.cloudStorage.getItem(key)).progress.old.familiarUntil,99);
  assert.ok(records.has(JSON.stringify(['alice','flashcards','old'])));
  assert.ok(storage.has(key)); // Original browser backup remains untouched.
  offline=true;
  client.cloudStorage.setItem(key,JSON.stringify({version:2,progress:{old:{familiarUntil:100}},options:{deck:'common'}}));
  await assert.rejects(client.flushCloud());
  assert.ok([...storage.keys()].some(k=>k.startsWith('voice-cloud-outbox:alice:')));
  offline=false;loseResponse=true;
  await assert.rejects(client.flushCloud());
  const remote=JSON.stringify(['alice','flashcards','old']);
  records.set(remote,{namespace:'flashcards',id:'old',owner:'alice',value:{familiarUntil:200}});
  await client.refreshCloud();
  assert.equal(JSON.parse(client.cloudStorage.getItem(key)).progress.old.familiarUntil,200);
  assert.ok(![...storage.keys()].some(k=>k.startsWith('voice-cloud-outbox:alice:')));
  const before=JSON.parse(client.cloudStorage.getItem(key));
  records.set(JSON.stringify(['alice','flashcards','other']),{owner:'alice',namespace:'flashcards',id:'other',value:{familiarUntil:300}});
  await client.refreshCloud();
  // A view working from an older snapshot must not delete a new remote word.
  before.progress.old.familiarUntil=400;client.cloudStorage.setItem(key,JSON.stringify(before));await client.refreshCloud();
  assert.equal(JSON.parse(client.cloudStorage.getItem(key)).progress.other.familiarUntil,300);
  owner='bob';
  const other=await import('../public/cloud-store.js?client-test-bob');await other.cloudReady;
  assert.equal(other.cloudStorage.getItem(key),null);
  assert.equal([...records.values()].filter(r=>r.owner==='bob').length,0);
});
