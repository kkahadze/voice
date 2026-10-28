import {fsrs, createEmptyCard} from './vendor/ts-fsrs-5.4.2.mjs';
export const scheduler=fsrs({request_retention:0.9,enable_fuzz:false,enable_short_term:true,learning_steps:['1m','10m'],relearning_steps:['10m']});
export const ratings=['Again','Hard','Good','Easy'];
export const dayKey=(time)=>{const d=new Date(time);return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;};
export function restoreCard(raw,now=Date.now()) {
 if(!raw||![0,1,2,3].includes(raw.state)||!['stability','difficulty','elapsed_days','scheduled_days','reps','lapses','learning_steps'].every(k=>Number.isFinite(raw[k])&&raw[k]>=0)||!Number.isFinite(new Date(raw.due).getTime())||(raw.last_review&&!Number.isFinite(new Date(raw.last_review).getTime())))return createEmptyCard(new Date(now));
 return {...raw,due:new Date(raw.due),...(raw.last_review?{last_review:new Date(raw.last_review)}:{})};
}
export function migrateProgress(raw,cards) {const result={};for(const {id} of cards){const old=raw?.[id];if(old&&typeof old==='object')result[id]={legacyStatus:old.status||old.legacyStatus||'',familiarUntil:Number.isFinite(old.familiarUntil)?old.familiarUntil:null,...(old.card?{card:restoreCard(old.card),firstReview:Number.isFinite(old.firstReview)?old.firstReview:null,history:Array.isArray(old.history)?old.history.slice(-100):[]}: {})};}return result;}
export function previewReview(record,now=Date.now()){return scheduler.repeat(restoreCard(record?.card,now),new Date(now));}
export function review(record,rating,now=Date.now()) {
 if(![1,2,3,4].includes(rating))throw new Error('Invalid rating');
 const result=previewReview(record,now)[rating];
 return {...record,familiarUntil:null,card:result.card,firstReview:record?.firstReview??now,history:[...(record?.history||[]),{rating,at:now,due:result.card.due.getTime(),state:result.card.state}].slice(-100)};
}
export function markFamiliar(record,now=Date.now()){return {...record,familiarUntil:now+60*86400000};}
export function studyQueue(cards,progress,options={},now=Date.now()){
 const scope=cards.filter(c=>(!options.set||Math.ceil(c.rank/100)===options.set));
 if(options.familiar)return scope.filter(c=>progress[c.id]?.familiarUntil>now).map(c=>c.id);
 if(options.browse)return scope.map(c=>c.id);
 const dueAt=c=>progress[c.id]?.familiarUntil??(progress[c.id]?.card&&restoreCard(progress[c.id].card,now).state!==0?new Date(progress[c.id].card.due).getTime():Infinity);
 const due=scope.filter(c=>dueAt(c)<=now).sort((a,b)=>dueAt(a)-dueAt(b));
 const introduced=Object.values(progress).filter(p=>p.firstReview&&dayKey(p.firstReview)===dayKey(now)).length;
 const allowance=Math.max(0,(options.newLimit??20)-introduced);
 const fresh=scope.filter(c=>!progress[c.id]?.familiarUntil&&(!progress[c.id]?.card||progress[c.id].card.state===0)).slice(0,allowance);
 return [...due,...fresh].map(c=>c.id);
}
export function intervalLabel(due,now=Date.now()){const min=Math.max(1,Math.round((new Date(due)-now)/60000));return min<60?`${min}m`:min<1440?`${Math.round(min/60)}h`:`${Math.round(min/1440)}d`;}
