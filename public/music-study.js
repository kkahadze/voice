import {cloudStorage} from './cloud-store.js';
import {normalizeTerm} from './music-cards.js';
import {loadMusicProgress,musicQueue,review,previewReview,intervalLabel,markFamiliar} from './music-state.js';
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};

export function createMusicStudy(host,{album,commonWords=[],pauseAudio=()=>{}}){
 const key='voice-album-words-fsrs-v1';let progress={},queue=[],card,shown=false,undo=null;
 try{progress=loadMusicProgress(album.cards,{getItem:()=>cloudStorage.getItem(key)});}catch{host.textContent='Your saved reviews could not be read. Existing progress has not been changed.';return;}
 const save=()=>{try{cloudStorage.setItem(key,JSON.stringify(progress));return true;}catch{host.prepend(el('p','music-error','Could not save this review. Browser storage may be full.'));return false;}};
 function build(){queue=musicQueue(album.cards,progress,'');card=album.cards.find(c=>c.id===queue[0]);shown=false;render();}
 function render(){host.replaceChildren();if(!card){host.append(el('p','music-count','All caught up. Due cards return automatically; up to 20 new words each day.'));}else{
 const box=el('div','music-card');box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('aria-label',shown?'Hide meaning':'Show meaning');box.setAttribute('aria-pressed',String(shown));const flip=()=>{const focused=document.activeElement===box;shown=!shown;render();if(focused)host.querySelector('.music-card')?.focus({preventScroll:true});};box.onclick=flip;box.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();flip();}};box.append(el('p','music-meta',card.song),el('h2','music-term',card.ru));
 if(shown){box.append(el('p','music-meaning',card.en));const details=[normalizeTerm(card.lemma)!==normalizeTerm(card.ru)?card.lemma:'',card.usage==='neutral'?'':card.usage].filter(Boolean).join(' · ');if(details)box.append(el('p','music-meta',details));const common=commonWords.find(w=>normalizeTerm(w.ru??w.es)===normalizeTerm(card.lemma));if(common&&common.en!==card.en)box.append(el('p','music-meta','Common meaning: '+common.en));}
 host.append(box);const ratings=el('div','music-ratings'),preview=previewReview(progress[card.id]);['Again','Hard','Good','Easy','Known'].forEach((label,i)=>{const b=el('button','',label);b.disabled=!shown;b.append(el('small','',i===4?'2 months':intervalLabel(preview[i+1].card.due)));b.onclick=()=>{pauseAudio();const before=progress[card.id]?structuredClone(progress[card.id]):null,id=card.id;progress[id]=i===4?markFamiliar(progress[id]):review(progress[id],i+1);if(!save()){if(before)progress[id]=before;else delete progress[id];return;}undo={id,before};build();};ratings.append(b);});host.append(ratings,el('p','music-count',`${queue.length} due + new`));}
 if(undo){const b=el('button','dev-button music-undo','Undo');b.onclick=()=>{const current=progress[undo.id];if(undo.before)progress[undo.id]=undo.before;else delete progress[undo.id];if(!save()){progress[undo.id]=current;return;}card=album.cards.find(c=>c.id===undo.id);undo=null;shown=false;queue=musicQueue(album.cards,progress,'');render();};host.append(b);}}
 window.addEventListener('cloud-updated',()=>{progress=loadMusicProgress(album.cards,{getItem:()=>cloudStorage.getItem(key)});undo=null;build();});
 build();return {refresh(){if(!card)build();}};
}
