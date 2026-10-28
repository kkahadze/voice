import {activeLanguage,languageName} from './languages.js';
import {cloudStorage,cloudReady} from './cloud-store.js';
await cloudReady;
import {migrateProgress,studyQueue,previewReview,review,intervalLabel,ratings,markFamiliar} from './spaced-repetition.js';
const root=document.querySelector('#panel-memorize'),$=id=>root.querySelector('#fc-'+id);
const key='voice-flashcards-fsrs-v2';
let cards=[],byId,progress={},queue=[],index=0,flipped=false,undo=null,listPage=0,loaded=false;
let options={filter:'due',reverse:false};
function save(){try{cloudStorage.setItem(key,JSON.stringify({version:2,progress,options,current:queue[index]}));return true;}catch{$('notice').textContent='Storage is full or unavailable. This review has not been saved.';return false;}}
function getQueue(){const q=studyQueue(cards,progress,{browse:options.filter!=='due',});return q;}
function build(){queue=getQueue();index=0;flipped=false;render();}
function render(){
 const card=byId.get(queue[index]);
 $('resume').hidden=options.filter==='due';
 $('study').hidden=!card;$('empty').hidden=!!card;$('undo').disabled=!undo;
 if(!card){const future=cards.filter(c=>(progress[c.id]?.card||progress[c.id]?.familiarUntil)).map(c=>progress[c.id]?.familiarUntil??new Date(progress[c.id].card.due).getTime()).filter(t=>t>Date.now()).sort((a,b)=>a-b)[0];$('empty-title').textContent=options.filter==='due'?'You’re caught up.':'No cards here yet.';$('empty-copy').textContent=future?`Next review ${new Date(future).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}. New words are limited to 20 per day.`:'Up to 20 new words each day. Come back tomorrow, or browse the deck.';return;}
 $('card').classList.toggle('is-flipped',flipped);$('card').setAttribute('aria-label',flipped?'Show question':'Show answer');
 $('front').textContent=options.reverse?card.en:card.stressed;$('back').textContent=options.reverse?card.stressed:card.en;$('front').lang=options.reverse?'en':activeLanguage;$('back').lang=options.reverse?activeLanguage:'en';
 $('front-face').setAttribute('aria-hidden',String(flipped));$('back-face').setAttribute('aria-hidden',String(!flipped));$('front-label').textContent=options.reverse?'ENGLISH':languageName.toUpperCase();$('back-label').textContent=options.reverse?languageName.toUpperCase():'ENGLISH';
 $('number').textContent=`WORD ${String(card.rank).padStart(4,'0')}`;$('position').textContent=`${index+1} / ${queue.length.toLocaleString()}`;
 $('previous').disabled=index===0;$('next').disabled=index===queue.length-1;
 const familiarUntil=progress[card.id]?.familiarUntil;const familiarButton=$('familiar');familiarButton.replaceChildren(document.createTextNode(familiarUntil>Date.now()?'Review now':'Known'));const interval=document.createElement('small');interval.textContent=familiarUntil>Date.now()?'Bring back':'2 months';familiarButton.append(interval);familiarButton.setAttribute('aria-label',familiarUntil>Date.now()?'Bring back to reviews':'Already know it · 2 months');$('familiar-note').textContent=familiarUntil>Date.now()?`Next check: ${new Date(familiarUntil).toLocaleDateString()}`:'';
 const preview=previewReview(progress[card.id]);$('ratings').hidden=false;$('ratings').classList.toggle('is-preview',options.filter!=='due');
 ratings.forEach((name,i)=>{const b=$('rate-'+(i+1));b.hidden=options.filter!=='due';b.disabled=!flipped;b.replaceChildren(document.createTextNode(name));const span=document.createElement('small');span.textContent=intervalLabel(preview[i+1].card.due);b.append(span);});
 $('rating-note').textContent=options.filter!=='due'?'Preview only · return to reviews to schedule practice.':flipped?'Again = forgot · Hard = remembered with effort':'Think of the meaning, then flip.';
}
function move(n){index=Math.max(0,Math.min(queue.length-1,index+n));flipped=false;render();save();}
function rate(rating){if(!flipped||options.filter!=='due'||!queue[index])return;const id=queue[index],before=progress[id]?structuredClone(progress[id]):null;const snapshot={id,previous:before,queue:[...queue],index,options:{...options}};progress[id]=review(progress[id],rating);if(!save()){if(before)progress[id]=before;else delete progress[id];return;}undo=snapshot;build();renderList();save();}
$('familiar').onclick=()=>{const id=queue[index];if(!id)return;const before=progress[id]?structuredClone(progress[id]):null;const snapshot={id,previous:before,queue:[...queue],index,options:{...options}};const bringBack=progress[id]?.familiarUntil>Date.now();progress[id]=bringBack?{...progress[id],familiarUntil:Date.now()}:markFamiliar(progress[id]);if(!save()){if(before)progress[id]=before;else delete progress[id];return;}undo=snapshot;if(bringBack){options.filter='due';}build();renderList();save();$('notice').textContent=bringBack?'Word returned to your reviews.':'Already known · next check in 60 days. You can undo this.';};
$('card').onclick=()=>{flipped=!flipped;render();};$('previous').onclick=()=>move(-1);$('next').onclick=()=>move(1);
ratings.forEach((_,i)=>$('rate-'+(i+1)).onclick=()=>rate(i+1));
$('undo').onclick=()=>{if(!undo)return;const current=progress[undo.id];if(undo.previous)progress[undo.id]=undo.previous;else delete progress[undo.id];if(!save()){progress[undo.id]=current;return;}queue=undo.queue;index=undo.index;options=undo.options||options;$('direction').textContent=options.reverse?`English → ${languageName}`:`${languageName} → English`;undo=null;flipped=false;render();renderList();save();$('notice').textContent='Change undone. Your previous schedule is restored.';};
$('direction').onclick=()=>{options.reverse=!options.reverse;$('direction').textContent=options.reverse?`English → ${languageName}`:`${languageName} → English`;flipped=false;render();save();};
$('resume').onclick=$('restart').onclick=()=>{options.filter='due';build();save();};$('all').onclick=()=>{options.filter='all';build();save();};
$('search').oninput=()=>{listPage=0;renderList();};
const normalize=s=>s.toLowerCase().replaceAll('ё','е').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function renderList(){const q=normalize($('search').value.trim()),matches=cards.filter(c=>normalize((c.es||c.ru)+' '+c.en).includes(q)),fragment=document.createDocumentFragment();
 for(const c of matches.slice(listPage*40,(listPage+1)*40)){const button=document.createElement('button');button.type='button';button.className='fc-word-row';const ru=document.createElement('span');ru.lang=activeLanguage;ru.textContent=c.stressed;const en=document.createElement('span');en.textContent=c.en;const state=document.createElement('span');state.textContent=progress[c.id]?.card?.state===2?'↻':String(c.rank);button.append(ru,en,state);button.onclick=()=>{options.filter='all';queue=getQueue();index=queue.indexOf(c.id);flipped=false;render();save();$('card').focus();$('study').scrollIntoView({behavior:'smooth',block:'center'});};fragment.append(button);}
 $('words').replaceChildren(fragment);$('list-count').textContent=`${matches.length.toLocaleString()} ${matches.length===1?'word':'words'}${matches.length?` · ${listPage*40+1}–${Math.min((listPage+1)*40,matches.length)}`:''}`;$('list-prev').disabled=listPage===0;$('list-next').disabled=(listPage+1)*40>=matches.length;
}
$('list-prev').onclick=()=>{listPage--;renderList();};$('list-next').onclick=()=>{listPage++;renderList();};
document.addEventListener('keydown',e=>{if(root.hidden||root.querySelector('#common-deck')?.hidden||root.closest('main').hidden||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,button,summary'))return;if(e.key===' '){e.preventDefault();if(queue[index]){flipped=!flipped;render();}}if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}if(e.key==='ArrowRight'){e.preventDefault();move(1);}if(/^[1-4]$/.test(e.key))rate(Number(e.key));});
async function init(){try{const response=await fetch(activeLanguage==='es'?'/flashcards-es-1000.json':'/flashcards-1000.json');if(!response.ok)throw Error();cards=await response.json();byId=new Map(cards.map(c=>[c.id,c]));let stored,legacy;try{stored=JSON.parse(cloudStorage.getItem(key));if(!stored)legacy=JSON.parse(cloudStorage.getItem('voice-flashcards-v1'));}catch{}progress=migrateProgress(stored?.progress||legacy?.progress,cards);const o=stored?.options;options={filter:'due',reverse:o?.reverse===true};$('direction').textContent=options.reverse?`English → ${languageName}`:`${languageName} → English`;queue=getQueue();index=Math.max(0,queue.indexOf(stored?.current));$('loading').hidden=true;$('content').hidden=false;loaded=true;render();renderList();if(legacy)$('notice').textContent='FSRS scheduling starts with your next review; earlier ratings remain backed up.';save();}catch{$('loading').textContent='Couldn’t load the deck. Reload the page to try again.';}}
setInterval(()=>{if(loaded&&options.filter==='due'&&!queue[index])build();},15000);
new MutationObserver(()=>{if(loaded&&!root.hidden&&options.filter==='due')build();}).observe(root,{attributes:true,attributeFilter:['hidden']});
window.addEventListener('cloud-updated',()=>{if(!loaded)return;try{const stored=JSON.parse(cloudStorage.getItem(key)||'{}');progress=migrateProgress(stored.progress,cards);undo=null;build();renderList();}catch{$('notice').textContent='Could not refresh saved progress.';}});
init();
