export const syncedKeys = ['voice-practice-v2','voice-flashcards-fsrs-v2','voice-album-words-fsrs-v1','voice-music-understanding-v1','voice-lyric-meanings-v1'];
export const recordKey = (namespace,id) => JSON.stringify([namespace,id]);
export function splitState(key, raw) {
  const value=JSON.parse(raw), records=[];
  const add=(namespace,id,value)=>records.push({namespace,id,value});
  if(key==='voice-practice-v2') {
    for(const c of value.cards||[])add('skills',c.id,c);
    for(const s of value.sessions||[])add('sessions',s.id,s);
    if(value.topicRecent)add('preferences','topicRecent',value.topicRecent);
  } else if(key==='voice-flashcards-fsrs-v2') {
    for(const [id,record] of Object.entries(value.progress||{}))add('flashcards',id,record);
    if(value.options)add('preferences','flashcard-options',value.options);
    if(value.current)add('preferences','flashcard-current',value.current);
  } else if(key==='voice-album-words-fsrs-v1'||key==='voice-music-understanding-v1') {
    for(const [id,record] of Object.entries(value||{}))add(key==='voice-album-words-fsrs-v1'?'album':'listening',id,record);
  } else if(key==='voice-lyric-meanings-v1')add('preferences','lyric-meanings',value);
  return records;
}
export function joinState(records) {
  const groups=Object.create(null);
  for(const {namespace,id,value} of records)if(value!==null)(groups[namespace]??=Object.create(null))[id]=value;
  const prefs=groups.preferences||{}, output={};
  if(groups.skills||groups.sessions||prefs.topicRecent)output['voice-practice-v2']=JSON.stringify({version:2,cards:Object.values(groups.skills||{}),sessions:Object.values(groups.sessions||{}).sort((a,b)=>b.at-a.at),topicRecent:prefs.topicRecent});
  if(groups.flashcards||prefs['flashcard-options'])output['voice-flashcards-fsrs-v2']=JSON.stringify({version:2,progress:groups.flashcards||{},options:prefs['flashcard-options'],current:prefs['flashcard-current']});
  if(groups.album)output['voice-album-words-fsrs-v1']=JSON.stringify(groups.album);
  if(groups.listening)output['voice-music-understanding-v1']=JSON.stringify(groups.listening);
  if(prefs['lyric-meanings']!==undefined)output['voice-lyric-meanings-v1']=JSON.stringify(prefs['lyric-meanings']);
  return output;
}
export function changedRecords(key,before,after) {
  const old=new Map(splitState(key,before||'{}').map(r=>[recordKey(r.namespace,r.id),r]));
  const next=new Map(splitState(key,after).map(r=>[recordKey(r.namespace,r.id),r]));
  const changes=[];
  for(const [id,r] of next)if(JSON.stringify(old.get(id)?.value)!==JSON.stringify(r.value))changes.push(r);
  for(const [id,r] of old)if(!next.has(id))changes.push({...r,value:null});
  return changes;
}
