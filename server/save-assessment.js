import {applyAssessment} from '../public/practice-state.js';
import {readSnapshot,writeRecords} from './learning-storage.js';

export async function saveAssessment(db,userId,session,result,candidates) {
  // Retry against newer server state if another device reviewed a skill while
  // the model was answering. A session can advance a board only once.
  for(let attempt=0;attempt<5;attempt++) {
    const snapshot=await readSnapshot(db,userId);
    const sessions=snapshot.records.filter(r=>r.namespace==='sessions'&&r.value).map(r=>r.value);
    const existing=sessions.find(s=>s.id===session.id);
    if(existing?.status==='undone')return;
    if(existing?.status==='applied'){
      if(!result.learning||existing.assessment?.learning)return;
      const enriched={...existing,assessment:{...existing.assessment,learning:result.learning}};
      if(await writeRecords(db,userId,{id:'learning:'+session.id,mode:'update',changes:[{namespace:'sessions',id:session.id,value:enriched}]},Date.now(),snapshot.revision))return;
      continue;
    }
    const cards=new Map(candidates.map(c=>[c.id,c]));
    for(const r of snapshot.records)if(r.namespace==='skills'&&r.value)cards.set(r.id,r.value);
    const assessed=applyAssessment({cards:[...cards.values()],sessions},session,result);
    const saved=assessed.sessions.find(s=>s.id===session.id);
    const changes=saved.changes.map(c=>({namespace:'skills',id:c.id,value:assessed.cards.find(card=>card.id===c.id)}));
    changes.push({namespace:'sessions',id:session.id,value:{...saved,assessment:result}});
    if(await writeRecords(db,userId,{id:'assessment:'+session.id,mode:'update',changes},Date.now(),snapshot.revision))return;
  }
  throw Error('Concurrent progress changes; retry the saved review.');
}
