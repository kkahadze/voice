import {cloudStorage,cloudReady} from './cloud-store.js';
await cloudReady;
import {topicCurriculum,talkCurriculum,listenCurriculum} from './active-curriculum.js';
import {applyAssessment,undoAssessment} from './practice-state.js';
const key='voice-practice-v2';
export function getPractice(storage=cloudStorage){
 const raw=storage.getItem(key);if(raw){const data=JSON.parse(raw);if(!Array.isArray(data.cards)||!Array.isArray(data.sessions))throw Error('Saved progress could not be read.');return withTopics(data);}
 let cards=JSON.parse(storage.getItem('voice-learning-boards-v1')||'[]');if(!Array.isArray(cards))throw Error('Saved boards could not be read.');
 cards=cards.filter(c=>['talk','listen'].includes(c.mode)&&typeof c.id==='string'&&Number.isInteger(c.stage)&&c.stage>=0&&c.stage<=4);
 const existing=new Set(cards.map(c=>c.id));for(const [mode,seed] of [['talk',talkCurriculum],['listen',listenCurriculum]]){const imported=new Set(JSON.parse(storage.getItem('voice-'+mode+'-curriculum-imported-v1')||'[]'));for(const card of seed)if(!existing.has(card.id)&&!imported.has(card.id))cards.push({...card,due:0});}
 return withTopics({version:2,cards,sessions:[]});
}
export function changePractice(change,storage=cloudStorage){const next=change(getPractice(storage));storage.setItem(key,JSON.stringify(next));if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('practice-updated'));return next;}
export const savePracticeCards=cards=>changePractice(s=>({...s,cards}));
export const savePending=session=>changePractice(s=>s.sessions.some(x=>x.id===session.id&&['applied','undone'].includes(x.status))?s:{...s,sessions:[{...session,status:session.incomplete?'incomplete':session.status==='active'?'active':'pending'},...s.sessions.filter(x=>x.id!==session.id)]});
export const commitAssessment=(session,result)=>changePractice(s=>applyAssessment(s,session,result));
export const setAssessmentError=(id,error)=>changePractice(s=>({...s,sessions:s.sessions.map(x=>x.id===id?{...x,status:'failed',error}:x)}));
export const undoSession=id=>changePractice(s=>undoAssessment(s,id));

function withTopics(data){const existing=new Set(data.cards.map(c=>c.id));return {...data,cards:[...data.cards,...topicCurriculum.filter(c=>!existing.has(c.id)).map(c=>({...c}))],topicRecent:data.topicRecent||{talk:[],listen:[]}};}
export const recordTopic=(mode,id)=>changePractice(s=>({...s,topicRecent:{...s.topicRecent,[mode]:[...(s.topicRecent?.[mode]||[]),id].slice(-3)}}));
