import {requestLanguage,learningUserId} from './language.js';
const namespaces = new Set(['skills','sessions','flashcards','album','listening','preferences']);
const json = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export async function readRecords(db, userId) {
  const result = await db.prepare('SELECT namespace, id, value FROM learning_records WHERE user_id = ?').bind(userId).all();
  return result.results.map(row => ({namespace:row.namespace, id:row.id, value:JSON.parse(row.value)}));
}

export async function readSnapshot(db,userId) {
  await db.prepare('INSERT OR IGNORE INTO learning_versions (user_id, revision) VALUES (?, 0)').bind(userId).run();
  const [rows,version]=await db.batch([
    db.prepare('SELECT namespace, id, value FROM learning_records WHERE user_id = ?').bind(userId),
    db.prepare('SELECT revision FROM learning_versions WHERE user_id = ?').bind(userId),
  ]);
  return {records:rows.results.map(r=>({...r,value:JSON.parse(r.value)})),revision:version.results[0].revision};
}

export async function writeRecords(db, userId, event, now = Date.now(), expectedRevision = null) {
  await db.prepare('INSERT OR IGNORE INTO learning_versions (user_id, revision) VALUES (?, 0)').bind(userId).run();
  const guard=expectedRevision===null?'':' AND (SELECT revision FROM learning_versions WHERE user_id = ?) = ?';
  const guardArgs=expectedRevision===null?[]:[userId,expectedRevision];
  const statements = event.changes.map(change => {
    const conflict = event.mode === 'import' ? `DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      WHERE excluded.namespace = 'skills' AND learning_records.value != 'null'
        AND COALESCE(json_extract(learning_records.value, '$.stage'), 0) = 0
        AND COALESCE(json_extract(learning_records.value, '$.reviews'), 0) = 0
        AND json_extract(learning_records.value, '$.lastReview') IS NULL
        AND (COALESCE(json_extract(excluded.value, '$.stage'), 0) > 0 OR COALESCE(json_extract(excluded.value, '$.reviews'), 0) > 0)` : `DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      WHERE NOT (excluded.namespace = 'sessions' AND json_extract(learning_records.value, '$.status') IN ('applied','undone')
        AND COALESCE(json_extract(excluded.value, '$.status'), '') NOT IN ('applied','undone'))`;
    return db.prepare(`INSERT INTO learning_records (user_id, namespace, id, value, updated_at)
      SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM learning_events WHERE user_id = ? AND id = ?)${guard}
      ON CONFLICT(user_id, namespace, id) ${conflict}`)
      .bind(userId,change.namespace,change.id,JSON.stringify(change.value),now,userId,event.id,...guardArgs);
  });
  statements.push(db.prepare(`INSERT OR IGNORE INTO learning_events (user_id, id, payload, created_at) SELECT ?, ?, ?, ? WHERE 1=1${guard}`)
    .bind(userId,event.id,JSON.stringify(event),now,...guardArgs));
  statements.push(db.prepare(`UPDATE learning_versions SET revision = revision + 1 WHERE user_id = ?${expectedRevision===null?'':' AND revision = ?'}`)
    .bind(userId,...(expectedRevision===null?[]:[expectedRevision])));
  // D1 batches are transactional: neither a partial upload nor a duplicate retry
  // can reapply an old event after a newer change. Tombstones prevent reimport.
  const result=await db.batch(statements);
  return result.at(-1).meta.changes===1;
}

export async function handleLearning(request, env) {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId) return json({error:'Sign in to sync your learning.'},401);
  let language;try{language=requestLanguage(request);}catch{return json({error:'Choose Russian or Spanish.'},400);}
  const storageUser=learningUserId(userId,language);
  if (!env.DB) return json({error:'Server storage is not available yet.'},503);
  try {
    if (request.method === 'GET') return json({userId,language,records:await readRecords(env.DB,storageUser)});
    if (request.method !== 'POST') return json({error:'Method not allowed.'},405);
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({error:'Reopen the app and retry.'},403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Expected JSON.'},415);
    const reader = request.body?.getReader();
    if (!reader) return json({error:'Missing update.'},400);
    let size=0; const chunks=[];
    while (true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();return json({error:'Update too large.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    let event;try{event=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid JSON.'},400);}
    if(!event||typeof event!=='object')return json({error:'Invalid update.'},400);
    if(event.language!==undefined&&event.language!==language)return json({error:'The language changed. Reload before syncing.'},409);
    if(event.userId!==userId)return json({error:'Your signed-in account changed. Reload before syncing.'},409);
    if(!event||typeof event.id!=='string'||!event.id||event.id.length>200||!['import','update'].includes(event.mode)||!Array.isArray(event.changes)||!event.changes.length||event.changes.length>50)return json({error:'Invalid update.'},400);
    const seen=new Set();
    for(const c of event.changes){
      if(!c||!namespaces.has(c.namespace)||typeof c.id!=='string'||!c.id||c.id.length>300||c.value===undefined||JSON.stringify(c.value).length>1500000)return json({error:'Invalid record.'},400);
      if(c.namespace==='sessions'&&c.value){
        if(typeof c.value!=='object'||Array.isArray(c.value))return json({error:'Invalid session.'},400);
        const row=await env.DB.prepare('SELECT value FROM learning_records WHERE user_id = ? AND namespace = ? AND id = ?').bind(storageUser,'sessions',c.id).first();
        const previous=row&&JSON.parse(row.value);
        // Only server reviews may create adaptive evidence. Browser sync can undo
        // an assessment but cannot forge or replace its trusted learning fields.
        const assessment={...(c.value.assessment||{})};
        if(previous?.assessment?.learning)assessment.learning=previous.assessment.learning;else delete assessment.learning;
        if(c.value.language!==undefined&&c.value.language!==language)return json({error:'This conversation belongs to another language.'},400);
        c.value={...c.value,language,assessment};
        if(previous?.assessment?.learning){c.value.at=previous.at;c.value.transcript=previous.transcript;}
      }
      const identity=JSON.stringify([c.namespace,c.id]);if(seen.has(identity))return json({error:'Duplicate record.'},400);seen.add(identity);
    }
    await writeRecords(env.DB,storageUser,event);
    return json({saved:true,id:event.id});
  } catch {return json({error:'Could not sync right now. Your device will retry.'},503);}
}
