export const stages=[
 {name:'Unlearned',label:'Not practiced yet'},
 {name:'Practicing',label:'Getting started'},
 {name:'Improving',label:'Building consistency'},
 {name:'Confident',label:'Using it comfortably'},
 {name:'Independent',label:'Consistent across sessions'}
];
export function moveCard(card,stage){if(!Number.isInteger(stage)||!stages[stage])throw Error('Invalid stage');return {...card,stage,due:0,lastSession:null};}
export function reviewCard(card,remembered,now=Date.now()){return {...moveCard(card,remembered?Math.min(4,card.stage+1):1),reviews:(card.reviews||0)+1,lastReview:now};}
export function applyAssessment(state,session,result,now=Date.now()){
 if(state.sessions.some(s=>s.id===session.id&&['applied','undone'].includes(s.status)))return state;
 const ids=new Set(),changes=[];
 const cards=state.cards.map(card=>{
  const update=result.updates.find(u=>u.id===card.id);
  if(!update||card.mode!==session.mode||ids.has(card.id)||!['success','needs_practice'].includes(update.outcome))return card;
  ids.add(card.id);const stage=update.outcome==='needs_practice'?Math.max(card.kind==='topic'?0:1,card.stage-1):Math.min(4,card.stage+1);
  // One conversation can advance a skill only one column.
  const next={...card,stage,due:0,reviews:(card.reviews||0)+1,lastReview:now,lastSession:session.id,evidence:update.reason};
  changes.push({id:card.id,title:card.front,from:card.stage,to:stage,reason:update.reason,quote:update.quote,before:card});return next;
 });
 const saved=state.sessions.find(s=>s.id===session.id);
 const record={id:session.id,mode:session.mode,language:session.language||saved?.language||'ru',at:session.at,topicId:session.topicId??saved?.topicId??null,lessonId:session.lessonId??saved?.lessonId??null,transcript:session.transcript??saved?.transcript??null,previousTranscript:session.previousTranscript??saved?.previousTranscript??[],continuedFrom:session.continuedFrom??saved?.continuedFrom??null,incomplete:false,transcriptRevealed:session.transcriptRevealed??saved?.transcriptRevealed??false,status:'applied',summary:result.summary,changes};
 return {...state,cards,sessions:[record,...state.sessions.filter(s=>s.id!==session.id)]};
}
export function undoAssessment(state,id){const session=state.sessions.find(s=>s.id===id);if(session?.status!=='applied')return state;const before=new Map(session.changes.map(c=>[c.id,c.before]));return {...state,cards:state.cards.map(c=>c.lastSession===id&&before.has(c.id)?before.get(c.id):c),sessions:state.sessions.map(s=>s.id===id?{...s,status:'undone'}:s)};}
