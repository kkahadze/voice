import {activeLanguage,languageApi,languageStorageKey} from './languages.js';
import {syncedKeys,recordKey,splitState,joinState,changedRecords} from './sync-data.js';

let owner=null, records=new Map(), pending=[], imported=false, task=null, cacheFailed=false;
const reads=new Map();
let lastEventTime=0;
let refreshTask=null;
const browser=typeof window!=='undefined';
const cacheKey=id=>languageStorageKey('voice-cloud-cache-v1:'+id);
const outboxPrefix=()=>`voice-cloud-outbox:${activeLanguage==='ru'?'':activeLanguage+':'}${encodeURIComponent(owner)}:`;
const values=()=>joinState([...records.values()]);
function status(message='') {
  if(!browser)return;
  const box=document.querySelector('#cloud-sync'),text=document.querySelector('#cloud-sync-message');
  if(box&&text){text.textContent=message;box.hidden=!message;}
}
function persist() {
  try{for(const event of pending)localStorage.setItem(outboxPrefix()+event.id,JSON.stringify(event));localStorage.setItem(cacheKey(owner),JSON.stringify({records:[...records.values()],imported}));localStorage.setItem(languageStorageKey('voice-cloud-owner'),owner);cacheFailed=false;}
  catch{cacheFailed=true;status('Changes are waiting to upload. Keep this page open until they sync.');}
}
function apply(changes){for(const r of changes)records.set(recordKey(r.namespace,r.id),r);}
function enqueue(changes,mode='update') {
  let batch=[],size=0;
  const send=()=>{if(batch.length){lastEventTime=Math.max(Date.now(),lastEventTime+1);pending.push({userId:owner,id:crypto.randomUUID(),at:lastEventTime,mode,changes:batch});}batch=[];size=0;};
  for(const change of changes){const bytes=new TextEncoder().encode(JSON.stringify(change)).length;if(batch.length&&(batch.length===50||size+bytes>1800000))send();batch.push(change);size+=bytes;}
  send();
  apply(changes);persist();status('Saving to your account…');
}
async function api(method='GET',event) {
  const response=await fetch(languageApi('/api/learning'),{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000),
    ...(event?{headers:{'Content-Type':'application/json'},body:JSON.stringify(event)}:{})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Could not sync your learning.');if(method==='GET'&&(result.language||'ru')!==activeLanguage)throw Error('The learning language changed. Reload to continue.');return result;
}
function notify(){window.dispatchEvent(new Event('cloud-updated'));window.dispatchEvent(new Event('practice-updated'));}
function readOutbox(){const result=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(outboxPrefix()))result.push(JSON.parse(localStorage.getItem(key)));}result.sort((a,b)=>(a.at||0)-(b.at||0)||a.id.localeCompare(b.id));lastEventTime=Math.max(lastEventTime,...result.map(e=>e.at||0));return result;}
const signature=()=>JSON.stringify([...records.entries()].sort(([a],[b])=>a.localeCompare(b)));
function mergeSnapshot(snapshot){records=new Map(snapshot.records.map(r=>[recordKey(r.namespace,r.id),r]));for(const event of pending)apply(event.changes);persist();}

async function connect() {
  const snapshot=await api();
  if(owner&&owner!==snapshot.userId)throw Error('Your account changed. Reload to load its progress.');
  if(!owner) {
    owner=snapshot.userId;
    const saved=JSON.parse(localStorage.getItem(cacheKey(owner))||'null');
    if(saved){records=new Map(saved.records.map(r=>[recordKey(r.namespace,r.id),r]));imported=!!saved.imported;}
    pending=readOutbox();
  }
  mergeSnapshot(snapshot);
  const legacyOwner=localStorage.getItem('voice-cloud-legacy-owner');
  if(activeLanguage==='ru'&&!imported&&(!legacyOwner||legacyOwner===owner)) {
    const legacy=[];
    for(const key of syncedKeys){const raw=localStorage.getItem(key);if(raw!==null)legacy.push(...splitState(key,raw));}
    // Import fills missing records and unused skill defaults. Practiced server
    // records and deletion tombstones win; the original browser backup remains.
    if(legacy.length)enqueue(legacy,'import');
    localStorage.setItem('voice-cloud-legacy-owner',owner);
  }
  imported=true;persist();
}
export async function flushCloud() {
  if(task)return task;
  task=(async()=>{
    if(!owner)await connect();
    while(pending.length){const event=pending[0];await api('POST',event);pending.shift();try{localStorage.removeItem(outboxPrefix()+event.id);}catch{}persist();}
  })();
  try{await task;status();}catch(error){status(error.message+' Your unsynced changes are kept on this device.');throw error;}finally{task=null;}
}
export async function refreshCloud() {
  if(refreshTask)return refreshTask;
  refreshTask=refreshSnapshot();
  try{return await refreshTask;}finally{refreshTask=null;}
}
async function refreshSnapshot() {
  await flushCloud();
  const snapshot=await api();if(snapshot.userId!==owner)throw Error('Your account changed. Reload to load its progress.');
  const before=signature();mergeSnapshot(snapshot);if(signature()!==before)notify();
}
const retry=()=>refreshCloud().catch(error=>status(error.message+(cacheFailed?' Keep this page open.':' Your device will retry.')));
export const cloudReady=browser?(async()=>{
  try{await connect();await refreshCloud();}
  catch(error){
    if(!owner){
      try{const last=localStorage.getItem(languageStorageKey('voice-cloud-owner')),saved=last&&JSON.parse(localStorage.getItem(cacheKey(last))||'null');if(saved){owner=last;records=new Map(saved.records.map(r=>[recordKey(r.namespace,r.id),r]));pending=readOutbox();for(const event of pending)apply(event.changes);imported=!!saved.imported;}}catch{}
    }
    status(error.message+(owner?' Changes will sync when you reconnect.':' Sign in and retry before practicing.'));
  }
  window.addEventListener('online',retry);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)retry();});
  document.querySelector('#cloud-sync-retry')?.addEventListener('click',retry);
  setInterval(()=>{if(!document.hidden)retry();},30000);
})():Promise.resolve();

export const cloudStorage={
  getItem(key){
    if(!browser)return null;
    if(syncedKeys.includes(key)){const raw=values()[key]??null;reads.set(key,raw);return raw;}
    // Read-only legacy migration paths. Never import another account's cache.
    return activeLanguage==='ru'&&localStorage.getItem('voice-cloud-legacy-owner')===owner?localStorage.getItem(key):null;
  },
  setItem(key,raw){
    if(!owner)throw Error('Sign in to save your learning.');
    if(!syncedKeys.includes(key))throw Error('Unsupported learning data.');
    const changes=changedRecords(key,reads.has(key)?reads.get(key):values()[key],raw);
    reads.set(key,raw);
    if(!changes.length)return;
    enqueue(changes);void flushCloud().catch(()=>{});
  },
};
