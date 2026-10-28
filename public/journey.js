import {languageApi,activeLanguage} from './languages.js';
import {cloudReady,refreshCloud} from './cloud-store.js';
import {getPractice} from './practice-store.js';
import {levels} from './journey-core.js';
import {assessSession} from './session-review.js';
await cloudReady;
const $=id=>document.getElementById(id),root=$('panel-journey');
let data=null,selected='B1',busy=false,settingsDirty=false;
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const button=(label,fn,cls='journey-button')=>{const b=el('button',cls,label);b.type='button';b.onclick=fn;return b;};
async function api(body){const r=await fetch(languageApi('/api/journey'),{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok)throw Error(result.error||'Could not load your journey.');return result;}
function start(targetId){window.voiceLessonTarget=targetId;$('tab-talk').click();$('new-conversation').click();$('microphone').focus();$('lesson-hint').textContent='Your lesson is ready. Tap the microphone when you’re ready to speak.';}
function render(){
 if(!data)return;
 $('journey-level').textContent=data.current;
 $('journey-subtitle').textContent=data.calibration?'Let’s discover what you can do, one conversation at a time.':'A path shaped by your conversations, your interests, and your next stretch.';
 $('journey-count').textContent=`${data.reviewedSessions} reviewed ${data.reviewedSessions===1?'conversation':'conversations'}`;
 $('journey-focus-title').textContent=data.plan.focus.title;
 $('journey-focus-description').textContent=data.plan.focus.criterion;
 $('journey-focus-reason').textContent=data.plan.reason;
 $('journey-session-length').textContent=`${data.settings.minutes} MIN · ${data.plan.level} PRACTICE`;
 $('journey-start').onclick=()=>start(data.plan.focus.id);
 $('lesson-hint').textContent=`Next: ${data.plan.focus.title}`;
 $('journey-retrieval').textContent=data.plan.review?`A little retrieval, too: ${data.plan.review.title}.`:'First we explore. Then we return to what needs another try.';
 const chapters=$('journey-chapters');chapters.replaceChildren();
 for(const c of data.chapters){const b=button('',()=>{selected=c.level;render();},'journey-chapter');b.setAttribute('aria-pressed',String(selected===c.level));b.append(el('strong','',c.level),el('span','',({B1:'Find your footing',B2:'Build your argument',C1:'Make meaning precise',C2:'Master the nuance'})[c.level]),el('small','',`${c.complete} / ${c.total} objectives established`));chapters.append(b);}
 const skills=$('journey-skills');skills.replaceChildren();
 for(const s of data.skills.filter(s=>s.level===selected)){
  const card=el('article','journey-skill');const top=el('div','journey-skill-top');top.append(el('span','journey-eyebrow',s.label),el('span','journey-badge'+(s.mastered?' earned':''),s.status));card.append(top,el('h3','',s.title),el('p','',s.criterion));
  const dots=el('div','journey-evidence-dots');dots.setAttribute('aria-label',`${s.successes} independent sessions, ${s.contexts} contexts`);for(let i=0;i<3;i++)dots.append(el('i',i<s.successes?'filled':''));dots.append(el('span','',`${s.successes} independent · ${s.contexts} contexts`));card.append(dots);
  const details=el('details','journey-evidence');details.append(el('summary','',s.evidence.length?'See the evidence':'What you’ll practice'));const task=el('p','journey-russian',s.task);task.lang=activeLanguage;details.append(task);
  for(const e of [...s.evidence].reverse()){const item=el('div','journey-evidence-item');item.append(el('small','',new Date(e.at).toLocaleDateString()+' · '+e.outcome.replaceAll('_',' ')),el('p','',e.reason));for(const q of e.quotes)item.append(el('blockquote','',q));details.append(item);}card.append(details);
  const canTry=levels.indexOf(s.level)<=Math.min(3,levels.indexOf(data.current)+1);if(canTry)card.append(button('Practice this →',()=>start(s.id),'journey-text-button'));else card.append(el('small','journey-muted','This objective opens as your path progresses.'));
  skills.append(card);
 }
 const memories=$('journey-memories');memories.replaceChildren();
 if(!data.memories.length)memories.append(el('p','journey-muted',data.settings.memory?'Useful details you share in completed conversations will appear here. Nothing has been inferred yet.':'Personal memory is paused. Your skill progress still updates.'));
 for(const m of [...data.memories].reverse()){const row=el('article','journey-memory');row.append(el('small','journey-eyebrow',m.category),el('p','',m.text));const proof=el('details','journey-evidence');proof.append(el('summary','','From your words'),el('blockquote','',m.quote));row.append(proof,button('Don’t use this',async()=>{try{await api({action:'forget',text:m.text});await load();}catch(e){message(e.message);}},'journey-text-button'));memories.append(row);}
 const repairs=$('journey-repairs');repairs.replaceChildren();if(!data.repairs.length)repairs.append(el('p','journey-muted','After a conversation, you’ll find precise examples to revisit here.'));
 for(const r of data.repairs){const row=el('article','journey-repair');row.append(el('small','journey-eyebrow',r.count>1?`Seen ${r.count} times`:'A new practice point'),el('h3','',r.pattern),el('p','',r.reason),el('blockquote','',r.quote),el('p','journey-correction',r.correction));repairs.append(row);}
 $('journey-pending').hidden=!data.pendingReviews.length;$('journey-pending-copy').textContent=`${data.pendingReviews.length} completed ${data.pendingReviews.length===1?'conversation is':'conversations are'} still waiting for a successful review. Your progress has not been guessed.`;
 $('journey-recap').hidden=!data.lastReview;if(data.lastReview){$('journey-recap-summary').textContent=data.lastReview.summary;$('journey-recap-next').textContent=data.lastReview.nextStep;}
 $('journey-history').hidden=!data.pendingHistory;$('journey-history-copy').textContent=`${data.pendingHistory} saved ${data.pendingHistory===1?'conversation can':'conversations can'} help shape your starting profile.`;
 if(!settingsDirty){const f=$('journey-form');for(const k of ['goal','interests','minutes','corrections'])f.elements[k].value=data.settings[k];f.elements.memory.checked=data.settings.memory;}
}
function message(text){$('journey-message').textContent=text;}
async function load(){try{data=await api();if(!root.dataset.loaded){selected=data.current;root.dataset.loaded='true';}render();message('');}catch(e){message(e.message);}}
$('journey-form').addEventListener('input',()=>{settingsDirty=true;});
$('journey-form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=$('journey-save');b.disabled=true;try{await api({action:'settings',goal:f.elements.goal.value,interests:f.elements.interests.value,minutes:Number(f.elements.minutes.value),corrections:f.elements.corrections.value,memory:f.elements.memory.checked});settingsDirty=false;await load();message('Preferences saved. Your next conversation will use them.');}catch(e){message(e.message);}finally{b.disabled=false;}};
$('journey-retry').onclick=load;
$('journey-pending-retry').onclick=async()=>{if(busy)return;busy=true;const b=$('journey-pending-retry');b.disabled=true;try{await refreshCloud();const pending=getPractice().sessions.filter(s=>['pending','failed'].includes(s.status)&&!s.incomplete).slice(0,5);for(const s of pending)await assessSession(s,{retry:true});await load();}finally{busy=false;b.disabled=false;}};
$('journey-history-review').onclick=async()=>{
 if(busy)return;busy=true;const b=$('journey-history-review');b.disabled=true;
 try{
  await refreshCloud();const sessions=getPractice().sessions.filter(s=>s.status==='applied'&&!s.incomplete&&!s.assessment?.learning&&s.transcript?.some(t=>t.speaker==='user')).sort((a,b)=>a.at-b.at).slice(0,5);
  for(let i=0;i<sessions.length;i++){message(`Learning from conversation ${i+1} of ${sessions.length}…`);const r=await fetch(languageApi('/api/practice/review'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...sessions[i],enrich:true}),signal:AbortSignal.timeout(70000)});const result=await r.json();if(!r.ok)throw Error(result.error||'Could not review this conversation.');}
  await refreshCloud();await load();message('Your profile now includes those conversations.');
 }catch(e){message(e.message);}finally{busy=false;b.disabled=false;}
};
$('journey-open').onclick=()=>{$('tab-journey').click();};
new MutationObserver(()=>{if(!root.hidden)load();}).observe(root,{attributes:true,attributeFilter:['hidden']});
window.addEventListener('cloud-updated',()=>{if(!busy)load();});
window.addEventListener('practice-updated',()=>{if(!busy&&!root.hidden)load();});
load();

window.addEventListener('learning-review-status',e=>{if(!document.body.classList.contains('active'))$('lesson-hint').textContent=e.detail;if(!root.hidden)message(e.detail);});
