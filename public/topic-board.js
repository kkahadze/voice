import {comfortStages} from './topics.js';
import {getPractice,changePractice} from './practice-store.js';
const root=document.querySelector('#topic-boards');let mode='talk';
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
function move(id,stage){try{changePractice(s=>({...s,cards:s.cards.map(c=>c.id===id&&c.kind==='topic'?{...c,stage,lastSession:null}:c)}));}catch{document.querySelector('#board-notice').textContent='Could not save topic comfort.';}}
function render(){
 let state;try{state=getPractice();}catch{return;}
 const scroll=root.querySelector('.board-columns')?.scrollLeft||0;root.replaceChildren();
 const section=el('section','learning-board curriculum-board topic-board');section.setAttribute('aria-label','Topic comfort board');
 const heading=el('div','board-heading'),title=el('div');title.append(el('h2','',mode==='listen'?'Listen topics':'Talk topics'),el('span','board-description','Comfort grows from left to right. Updated after completed sessions.'));
 heading.append(title);section.append(heading,el('p','curriculum-summary','Not practiced topics start on the left. Change a level yourself if you already feel comfortable. Progress is saved to your account.'),el('p','board-swipe-hint','Swipe to see each stage →'));
 const columns=el('div','board-columns');columns.tabIndex=0;columns.setAttribute('role','region');columns.setAttribute('aria-label','Topic comfort stages, scroll horizontally');
 comfortStages.forEach((name,stage)=>{
  const col=el('div','board-column'),subset=state.cards.filter(c=>c.kind==='topic'&&c.mode===mode&&c.stage===stage);
  const h=el('div','column-heading');h.append(el('span','stage-dot stage-'+stage),el('h3','',name),el('span','card-count',String(subset.length)));col.append(h);
  col.ondragover=e=>e.preventDefault();col.ondrop=e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(state.cards.some(c=>c.id===id&&c.kind==='topic'&&c.mode===mode))move(id,stage);};
  for(const card of subset){const tile=el('article','learning-card');tile.draggable=true;tile.ondragstart=e=>e.dataTransfer.setData('text/plain',card.id);tile.append(el('p','card-front',card.front),el('p','topic-russian',card.ru),el('span','due-badge',card.reviews?`${card.reviews} sessions reviewed`:'Not practiced yet'));
   if(card.evidence){const details=el('details','topic-evidence');details.append(el('summary','','Last feedback'),el('p','',card.evidence));tile.append(details);}
   const level=el('select','topic-level');level.setAttribute('aria-label',`${mode==='talk'?'Talk':'Listen'} comfort for ${card.front}`);comfortStages.forEach((label,i)=>{const o=el('option','',label);o.value=i;level.append(o);});level.value=stage;level.onchange=()=>move(card.id,Number(level.value));tile.append(level);col.append(tile);
  }if(!subset.length)col.append(el('div','column-empty','No topics here yet'));columns.append(col);
 });section.append(columns);root.append(section);columns.scrollLeft=scroll;
}
window.addEventListener('practice-updated',render);window.addEventListener('storage',e=>{if(e.key==='voice-practice-v2')render();});render();
