import test from 'node:test';
import assert from 'node:assert/strict';

test('Spanish browser sync never imports Russian legacy state, cache, or offline edits',async t=>{
 const originals=Object.fromEntries(['window','document','localStorage','fetch','setInterval'].map(k=>[k,globalThis[k]]));
 t.after(()=>{for(const [k,v] of Object.entries(originals))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
 const russian=JSON.stringify({version:2,progress:{'ru-word-и':{familiarUntil:99}}});
 const storage=new Map([
  ['voice-flashcards-fsrs-v2',russian],['voice-cloud-owner','alice'],['voice-cloud-legacy-owner','alice'],
  ['voice-cloud-cache-v1:alice',JSON.stringify({imported:true,records:[{namespace:'flashcards',id:'ru-word-и',value:{familiarUntil:99}}]})],
  ['voice-cloud-outbox:alice:pending-ru',JSON.stringify({userId:'alice',id:'pending-ru',mode:'update',changes:[{namespace:'flashcards',id:'ru-word-и',value:{familiarUntil:100}}]})],
 ]);
 const oldRussianCache=storage.get('voice-cloud-cache-v1:alice');
 globalThis.localStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 globalThis.window=Object.assign(new EventTarget(),{location:{search:'?lang=es'}});
 globalThis.document=Object.assign(new EventTarget(),{hidden:false,querySelector:()=>null});globalThis.setInterval=()=>0;
 const records=new Map(),posted=[];let offline=false;
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'/api/learning?language=es');if(offline)throw Error('Offline');
  if(options.method==='GET')return Response.json({userId:'alice',language:'es',records:[...records.values()]});
  const event=JSON.parse(options.body);posted.push(event);assert.equal(event.userId,'alice');
  for(const c of event.changes)records.set(c.id,c);return Response.json({saved:true});
 };
 const client=await import('../public/cloud-store.js');await client.cloudReady;
 assert.equal(client.cloudStorage.getItem('voice-flashcards-fsrs-v2'),null);assert.equal(posted.length,0);
 offline=true;client.cloudStorage.setItem('voice-flashcards-fsrs-v2',JSON.stringify({version:2,progress:{'es-word-hola':{familiarUntil:200}}}));await assert.rejects(client.flushCloud());
 assert.ok([...storage.keys()].some(k=>k.startsWith('voice-cloud-outbox:es:alice:')));
 assert.ok(storage.has('voice-cloud-outbox:alice:pending-ru'));
 offline=false;await client.refreshCloud();
 assert.deepEqual(Object.keys(JSON.parse(client.cloudStorage.getItem('voice-flashcards-fsrs-v2')).progress),['es-word-hola']);
 assert.equal(storage.get('voice-cloud-cache-v1:alice'),oldRussianCache);
 assert.equal(storage.get('voice-flashcards-fsrs-v2'),russian);
 assert.ok(storage.has('voice-cloud-cache-v1:alice:es'));
 assert.ok(posted.every(e=>e.changes.every(c=>!c.id.startsWith('ru-'))));
});
