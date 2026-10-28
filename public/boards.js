import {comfortStages} from './topics.js';
import {stages,moveCard,reviewCard} from './practice-state.js';
import {talkCurriculum,listenCurriculum} from './active-curriculum.js';
import {languageName} from './languages.js';
import {getPractice,savePracticeCards,undoSession} from './practice-store.js';
const $=selector=>document.querySelector(selector);
const modes={talk:{name:'Talk',description:'Speaking skills, updated after each conversation.'}};
const curricula={talk:talkCurriculum,listen:listenCurriculum};
let cards=[];try{cards=getPractice().cards.filter(c=>c.kind!=='topic');}catch{$('#board-notice').textContent='Saved progress could not be read. Your existing data has not been changed.';}
const topicsByMode=Object.fromEntries(Object.entries(curricula).map(([mode,seed])=>[mode,[...new Set(seed.map(card=>card.topic))]]));
const filters=Object.fromEntries(Object.keys(curricula).map(mode=>[mode,{query:'',topic:''}]));
const curriculumCopy={
 talk:{search:`Search speaking tasks, situations, or ${languageName}…`,summary:'Speaking tasks + examples + follow-up questions'},
 memorize:{search:`Search English, ${languageName}, or a concept…`,summary:`English → ${languageName} + grammar in context`},
 listen:{search:`Search listening tasks, scripts, or ${languageName}…`,summary:'Listening tasks + scripts + answer keys · Practice in the Listen tab'}
};
const visibleLimits={};
function normalize(value){return value.toLocaleLowerCase().replaceAll('ё','е').normalize('NFD').replaceAll('\u0301','');}
function matchesCard(card){const filter=filters[card.mode];return !filter||((!filter.topic||card.topic===filter.topic)&&(!filter.query||normalize([card.front,card.back,card.topic||''].join(' ')).includes(normalize(filter.query.trim()))));}
let selectedId=null;
const boards=$('#learning-boards');
function el(tag,className,text){const e=document.createElement(tag); if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function dueLabel(card){return card.lastReview?'Practiced '+new Date(card.lastReview).toLocaleDateString():card.stage===0?'Ready to practice':'Keep practicing';}
function save(message){try{savePracticeCards([...cards,...getPractice().cards.filter(c=>c.kind==='topic')]);$('#board-notice').textContent=message;}catch{$('#board-notice').textContent='Storage unavailable. Changes will last only for this visit.';} render();}
function render(){
 const activeSearch=document.activeElement?.matches('.curriculum-search')?document.activeElement.id:null;
 const cursor=activeSearch?document.activeElement.selectionStart:null;
 const scrolls=new Map([...boards.querySelectorAll('.board-column')].map(c=>[c.dataset.mode+c.dataset.stage,c.scrollTop]));
 const horizontal=[...boards.querySelectorAll('.board-columns')].map(c=>c.scrollLeft);
 boards.replaceChildren();$('#total-cards').textContent=cards.filter(c=>c.mode==='talk').length;$('#due-cards').textContent=cards.filter(c=>c.mode==='talk'&&c.stage===1).length;
 Object.entries(modes).forEach(([mode,info],boardIndex)=>{
  const section=el('section','learning-board');section.setAttribute('aria-label',info.name+' learning board');section.classList.add(mode+'-board');if(curricula[mode])section.classList.add('curriculum-board');
  const head=el('div','board-heading');const title=el('div');title.append(el('span','board-number','0'+(boardIndex+1)),el('h2','',info.name),el('span','board-description',info.description));
  const add=el('button','dev-button','+ Add card');add.setAttribute('aria-label','Add '+info.name+' card');add.onclick=()=>{const f=$('#card-form');f.reset();f.elements.mode.value=mode;$('#card-dialog').showModal();};head.append(title,add);section.append(head);
  if(curricula[mode]){
   const topics=topicsByMode[mode],state=filters[mode];
   const toolbar=el('div','curriculum-toolbar');
   const search=el('input','curriculum-search');search.type='search';search.id=mode+'-search';search.placeholder=curriculumCopy[mode].search;search.setAttribute('aria-label','Search '+info.name+' cards');search.value=state.query;
   const resetLimits=()=>{for(const key in visibleLimits)if(key.startsWith(mode))delete visibleLimits[key];};
   search.oninput=()=>{state.query=search.value;resetLimits();render();};
   const filter=el('select','curriculum-topic');filter.setAttribute('aria-label','Filter '+info.name+' by topic');const all=el('option','','All '+topics.length+' topics');all.value='';filter.append(all);topics.forEach(topic=>{const option=el('option','',topic);option.value=topic;filter.append(option);});filter.value=state.topic;
   filter.onchange=()=>{state.topic=filter.value;resetLimits();render();};
   const count=cards.filter(c=>c.mode===mode).length;const matched=cards.filter(c=>c.mode===mode&&matchesCard(c)).length;
   const summary=el('p','curriculum-summary',matched+' of '+count+' cards · '+curriculumCopy[mode].summary);
   toolbar.append(search,filter);section.append(toolbar,summary);
  }
  section.append(el('p','board-swipe-hint','Swipe to see each stage →'));
  const columns=el('div','board-columns');columns.tabIndex=0;columns.setAttribute('role','region');columns.setAttribute('aria-label',info.name+' stages, scroll horizontally');
  stages.forEach((stage,index)=>{
   const column=el('div','board-column');column.dataset.stage=index;column.dataset.mode=mode;
   const subset=cards.filter(c=>c.mode===mode&&c.stage===index&&matchesCard(c)).sort((a,b)=>a.due-b.due);
   const heading=el('div','column-heading');heading.append(el('span','stage-dot stage-'+index),el('h3','',stage.name),el('span','card-count',String(subset.length)));column.append(heading,el('p','interval',stage.label));
   column.addEventListener('dragover',e=>{e.preventDefault();column.classList.add('drop-target');});column.addEventListener('dragleave',()=>column.classList.remove('drop-target'));
   column.addEventListener('drop',e=>{e.preventDefault();column.classList.remove('drop-target');const id=e.dataTransfer.getData('text/plain');const card=cards.find(c=>c.id===id&&c.mode===mode);if(card){cards=cards.map(c=>c.id===id?moveCard(c,index):c);save('Card moved to '+stage.name+'.');}});
   const limit=visibleLimits[mode+index]||40;
   subset.slice(0,limit).forEach(card=>{const tile=el('button','learning-card');tile.type='button';tile.draggable=true;tile.setAttribute('aria-label',info.name+': '+card.front+', '+stage.name+', '+dueLabel(card));tile.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',card.id);e.dataTransfer.effectAllowed='move';});
    const meta=el('div','card-meta');meta.append(el('span','',card.topic||'Personal card'),el('span','',String(card.reviews||0)+' reviews'));tile.append(meta,el('p','card-front',card.front));const badge=el('span','due-badge'+(card.due<=Date.now()?' is-due':''),dueLabel(card));tile.append(badge);tile.onclick=()=>openReview(card.id);column.append(tile);});
   if(subset.length>limit){const more=el('button','dev-button load-more','Show next '+Math.min(40,subset.length-limit)+' · '+(subset.length-limit)+' remaining');more.onclick=()=>{visibleLimits[mode+index]=limit+40;render();};column.append(more);}
   if(!subset.length)column.append(el('div','column-empty',filters[mode]&&(filters[mode].query||filters[mode].topic)?'No matching cards':'No cards yet'));columns.append(column);
  });section.append(columns);boards.append(section);
 });
 boards.querySelectorAll('.board-column').forEach(c=>c.scrollTop=scrolls.get(c.dataset.mode+c.dataset.stage)||0);boards.querySelectorAll('.board-columns').forEach((c,i)=>c.scrollLeft=horizontal[i]||0);
 if(activeSearch){const search=$('#'+activeSearch);search.focus({preventScroll:true});search.setSelectionRange(cursor,cursor);}
}
function openReview(id){const card=cards.find(c=>c.id===id);if(!card)return;selectedId=id;$('#review-mode').textContent=modes[card.mode].name+(card.topic?' / '+card.topic:'');$('#review-title').textContent=card.front;$('#review-due').textContent=dueLabel(card)+(card.evidence?' · '+card.evidence:'');$('#review-answer').textContent=card.back;$('#review-answer').hidden=true;$('#review-ratings').hidden=true;$('#show-answer').hidden=false;$('#show-answer').textContent=card.mode==='talk'?'Show example & follow-up':card.mode==='listen'?'Show script & answer':'Show answer';$('#rate-again').textContent='Need practice';$('#review-stage').replaceChildren(...stages.map((s,i)=>{const o=el('option','',s.name);o.value=i;return o;}));$('#review-stage').value=card.stage;$('#rate-good').textContent='Mark successful practice';$('#review-dialog').showModal();}
$('#show-answer').onclick=()=>{$('#review-answer').hidden=false;$('#review-ratings').hidden=false;$('#show-answer').hidden=true;};
for(const [id,remembered] of [['#rate-again',false],['#rate-good',true]])$(id).onclick=()=>{cards=cards.map(c=>c.id===selectedId?reviewCard(c,remembered):c);$('#review-dialog').close();save('Practice recorded.');};
$('#review-stage').onchange=e=>{cards=cards.map(c=>c.id===selectedId?moveCard(c,Number(e.target.value)):c);$('#review-dialog').close();save('Stage updated.');};
$('#delete-card').onclick=()=>{cards=cards.filter(c=>c.id!==selectedId);$('#review-dialog').close();save('Card deleted.');};
$('#card-form').onsubmit=e=>{e.preventDefault();const data=new FormData(e.target);const front=data.get('front').trim(),back=data.get('back').trim();if(!front||!back)return;cards.push({id:crypto.randomUUID(),mode:data.get('mode'),front,back,stage:0,due:Date.now(),reviews:0,demo:false});$('#card-dialog').close();save('Card added.');};
$('#close-card').onclick=()=>$('#card-dialog').close();$('#close-review').onclick=()=>$('#review-dialog').close();
function setDev(active){if(active){window.voice?.stop();window.spanishListening?.stop();}document.body.classList.toggle('dev-mode',active);$('#developer').hidden=!active;document.querySelector('main').hidden=active;$('#robot-button').setAttribute('aria-pressed',String(active));$('#robot-button').setAttribute('aria-label',active?'Exit developer mode':'Open developer mode');if(active){render();$('#exit-dev').focus();}else $('#robot-button').focus();window.scrollTo({top:0,behavior:'instant'});}
$('#robot-button').onclick=()=>setDev(!document.body.classList.contains('dev-mode'));$('#exit-dev').onclick=()=>setDev(false);
render();setInterval(()=>{if(document.body.classList.contains('dev-mode')&&!$('#review-dialog').open&&!$('#card-dialog').open)render();},60000);

function renderHistory(){const box=$('#session-history-list');box.replaceChildren();let sessions;try{sessions=getPractice().sessions;}catch{return;}box.append(el('p','history-storage','Your conversations and progress are saved to your account.'));if(!sessions.length){box.append(el('p','','Completed conversations will appear here.'));return;}
 for(const session of sessions){const item=el('article','session-record');item.append(el('strong','',session.mode==='listen'?'Listen':'Talk'),el('span','session-date',new Date(session.at).toLocaleString()),el('p','',session.summary||session.error||(session.status==='incomplete'?'Incomplete session · no board changes':session.status==='active'?'Conversation saved · may still be in progress':'Review pending')));
 if(Array.isArray(session.transcript)&&session.transcript.length){
  if(session.mode==='talk'){const resume=el('button','dev-button','Continue conversation');resume.onclick=()=>{setDev(false);$('#tab-talk').click();window.voice?.continueSession(session);};item.append(resume);} 
  const transcript=el('details','saved-transcript');transcript.append(el('summary','','View transcript'));
  if(session.incomplete||session.status==='incomplete')transcript.append(el('p','','Partial transcript · session ended before finalization.'));
  const messages=el('div','saved-transcript-messages');
  for(const turn of session.transcript){const row=el('article','saved-transcript-turn '+(turn.speaker==='user'?'user':'teacher'));row.append(el('strong','',turn.speaker==='user'?'You':'Teacher'),el('p','',turn.text));messages.append(row);}transcript.append(messages);
  const download=el('button','dev-button','Download transcript');download.onclick=()=>{const text=[new Date(session.at).toLocaleString(),session.incomplete?'Partial transcript':'',...session.transcript.map(t=>(t.speaker==='user'?'You':'Teacher')+': '+t.text)].filter(Boolean).join('\n\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='conversation-'+new Date(session.at).toISOString().replaceAll(':','-')+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};transcript.append(download);item.append(transcript);
 }else item.append(el('p','history-storage',Array.isArray(session.transcript)?'No speech was captured.':'Transcript unavailable for this older conversation.'));
 for(const c of session.changes||[]){item.append(el('p','session-change',c.title+' · '+(c.before?.kind==='topic'?comfortStages[c.from]:stages[c.from].name)+' → '+(c.before?.kind==='topic'?comfortStages[c.to]:stages[c.to].name)+' — '+c.reason),el('blockquote','',c.quote));}
 if(['failed','pending'].includes(session.status)){const b=el('button','dev-button','Retry review');b.onclick=()=>window.retryPracticeReview?.(session.id);item.append(b);}
 if(session.status==='applied'&&session.changes.length){const b=el('button','dev-button','Undo board updates');b.onclick=()=>{try{undoSession(session.id);}catch{$('#board-notice').textContent='Could not undo this update.';}};item.append(b);}if(session.status==='undone')item.append(el('p','','Board updates undone.'));box.append(item);}
}
window.addEventListener('practice-updated',()=>{cards=getPractice().cards.filter(c=>c.kind!=='topic');render();renderHistory();});
window.addEventListener('storage',event=>{if(event.key==='voice-practice-v2'){cards=getPractice().cards.filter(c=>c.kind!=='topic');render();renderHistory();}});
renderHistory();
