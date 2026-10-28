import {activeLanguage,languageName} from './languages.js';
const $=id=>document.getElementById(id),trigger=$('language-trigger'),menu=$('language-options'),notice=$('language-notice');
document.documentElement.dataset.learningLanguage=activeLanguage;
document.title=`Voice · ${languageName}`;
$('current-language').textContent=languageName;
trigger.setAttribute('aria-label',`Learning language: ${languageName}`);
$('lesson-hint').textContent=`Your ${languageName}, growing with you.`;
$('journey-language').textContent=`YOUR ${languageName.toUpperCase()} · A LIVING JOURNEY`;
$('journey-goal-label').textContent=`What do you want ${languageName} to make possible?`;
$('journey-form').elements.goal.placeholder=`Conversations with friends, reading literature, working in ${languageName}…`;
$('journey-method-language').textContent=`This is a spoken ${languageName} learning path, not a CEFR certificate.`;
$('fc-search').placeholder=`Search ${languageName} or English…`;
$('fc-search-label').textContent=`Search ${languageName} or English`;
$('fc-direction').textContent=`${languageName} → English`;
$('new-card-front').placeholder=activeLanguage==='es'?'por ejemplo, contar cómo ha ido tu día':'например, рассказать о своём дне';
for(const button of menu.querySelectorAll('[data-language]'))button.setAttribute('aria-checked',String(button.dataset.language===activeLanguage));
function open(value){menu.hidden=!value;trigger.setAttribute('aria-expanded',String(value));}
trigger.onclick=()=>open(menu.hidden);
trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open(true);menu.querySelector(`[data-language="${activeLanguage}"]`).focus();}};
document.addEventListener('click',e=>{if(!e.target.closest('.language-nav'))open(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){open(false);trigger.focus();}});
menu.onkeydown=e=>{const choices=[...menu.querySelectorAll('button')],i=choices.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();choices[e.key==='Home'?0:e.key==='End'?choices.length-1:(i+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length].focus();}};
let changing=false;
for(const button of menu.querySelectorAll('[data-language]'))button.onclick=async()=>{
 const language=button.dataset.language;if(language===activeLanguage){open(false);trigger.focus();return;}if(changing)return;
 if((window.voice?.isBusy?.()||['connecting','active','closing'].includes(window.voice?.state))||window.spanishListening?.isBusy()){
  notice.textContent='Finish your conversation before changing languages.';notice.hidden=false;open(false);return;
 }
 $('music-player')?.pause();changing=true;trigger.disabled=true;open(false);notice.hidden=false;notice.textContent=`Saving your ${languageName} progress…`;document.body.classList.add('language-changing');
 try{
  const {waitForReviews}=await import('./session-review.js');await waitForReviews();
  const {flushCloud}=await import('./cloud-store.js');await flushCloud();
  try{localStorage.setItem('voice-language',language);}catch{}
  const url=new URL(location.href);url.searchParams.set('lang',language);
  const selected=document.querySelector('.mode-option[aria-selected="true"]')?.dataset.mode||'talk';url.searchParams.set('view',selected);
  location.assign(url.href);
 }catch{notice.textContent='Could not finish saving. Reconnect, then try changing languages again.';changing=false;trigger.disabled=false;document.body.classList.remove('language-changing');}
};
const spanish=activeLanguage==='es';
// The deck picker works immediately, including while its content is loading.
$('memorize-deck').addEventListener('change',event=>{$('common-deck').hidden=event.target.value!=='common';$('music-memorize').hidden=event.target.value!=='album';});
$('russian-deck-info').hidden=spanish;$('spanish-deck-info').hidden=!spanish;
if(spanish){
 $('progress-method').textContent='Talk updates after a completed conversation, using evidence from your answers. Each skill can move one stage per session. Memorize uses FSRS reviews. Listen saves vocabulary understanding and reviews completed listening conversations. Reading support prevents that attempt from advancing listening skills. Progress is saved to your account.';
 $('memorize-deck').querySelector('[value="album"]').textContent='Listening vocabulary';$('memorize-deck').querySelector('[value="common"]').textContent='1,000 Spanish essentials';
 import('./spanish-listen.js').then(({initSpanishListening})=>initSpanishListening($('listening-content'))).catch(()=>{$('music-status').textContent='Listening could not load. Reload to try again.';});
}else import('./music.js');
const view=new URLSearchParams(location.search).get('view');if(['talk','memorize','listen','journey'].includes(view))$('tab-'+view).click();
