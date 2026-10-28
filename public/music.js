import {cloudStorage,cloudReady} from './cloud-store.js';
await cloudReady;
import {activeLyricIndex,lyricSeekTarget} from './lyric-sync.js';
import {inSong,forSong} from './music-cards.js';
import {createMusicStudy} from './music-study.js';
const $=id=>document.getElementById(id),player=$('music-player'),songSelect=$('music-song');
let album,transcripts,commonWords=[],stopAt=null,pendingSongStart=null;const studies=[];
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const tell=text=>$('music-status').textContent=text;
let preparedAudio=null,playRequest=0,playbackLoading=false;
function prepareAudio(){if(!preparedAudio)preparedAudio=(async()=>{const response=await fetch(player.dataset.source||player.getAttribute('src'));if(!response.ok)throw Error('audio');const url=URL.createObjectURL(await response.blob());await new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('metadata timeout')),30000);const ready=()=>finish(),error=()=>finish(Error('audio'));function finish(reason){clearTimeout(timer);player.removeEventListener('loadedmetadata',ready);player.removeEventListener('error',error);reason?reject(reason):resolve();}player.addEventListener('loadedmetadata',ready);player.addEventListener('error',error);player.src=url;player.load();});})().catch(error=>{preparedAudio=null;throw error;});return preparedAudio;}
player.dataset.source=player.dataset.source||'/music/million-dollar-business.mp3';
function pauseMusic(){playRequest++;playbackLoading=false;player.pause();stopAt=null;updateTransport();}
async function play(start,end){pendingSongStart=null;const request=++playRequest;window.voice?.stop();player.pause();stopAt=null;playbackLoading=true;updateTransport();try{if(!preparedAudio)tell('Loading album audio…');await prepareAudio();if(request!==playRequest)return;stopAt=end;player.currentTime=start;await player.play();tell('');}catch{if(request!==playRequest)return;stopAt=null;tell('Could not start audio. Tap play to try again.');}finally{if(request===playRequest){playbackLoading=false;updateTransport();}}}
player.addEventListener('play',()=>{if(pendingSongStart!==null||!preparedAudio)play(pendingSongStart??player.currentTime,stopAt??album?.duration);});
player.addEventListener('timeupdate',()=>{if(stopAt!==null&&player.currentTime>=stopAt){player.pause();stopAt=null;}});
player.addEventListener('error',()=>tell('The album audio could not load. Reload and try again.'));
player.addEventListener('seeking',()=>{if(stopAt!==null&&player.currentTime>stopAt)stopAt=null;});
function currentTrackIndex(){if(!album)return -1;const selected=album.songs.findIndex(s=>s.id===songSelect.value);return selected>=0?selected:Math.max(0,album.songs.findIndex(s=>player.currentTime>=s.start&&player.currentTime<s.end));}
function updateTransport(){const ready=!!album,index=currentTrackIndex(),playing=playbackLoading||!player.paused;const button=$('music-toggle');button.disabled=!ready;button.dataset.playing=String(playing);button.setAttribute('aria-label',playing?'Pause':'Play');button.setAttribute('aria-busy',String(playbackLoading));$('music-previous').disabled=!ready;$('music-next').disabled=!ready||index>=album.songs.length-1;}
$('music-toggle').onclick=()=>{if(!album)return;if(playbackLoading||!player.paused){pauseMusic();return;}const track=album.songs.find(s=>s.id===songSelect.value)||{start:0,end:album.duration};let start=pendingSongStart??player.currentTime;if(start<track.start||start>=track.end-.05)start=track.start;play(start,track.end);};
function skipSong(direction){if(!album)return;const playing=playbackLoading||!player.paused;const index=Math.max(0,Math.min(album.songs.length-1,currentTrackIndex()+direction));const track=album.songs[index];songSelect.value=track.id;songSelect.onchange();if(playing)play(track.start,track.end);}
$('music-previous').onclick=()=>skipSong(-1);$('music-next').onclick=()=>skipSong(1);
for(const event of ['play','pause','ended','error','timeupdate'])player.addEventListener(event,updateTransport);
function clip(card){play(card.start,card.end);}
const understandingKey='voice-music-understanding-v1';let understanding={},understandingReadable=true;
try{const saved=JSON.parse(cloudStorage.getItem(understandingKey)||'{}');if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error();understanding=saved;}catch{understandingReadable=false;}
function renderWords(){const host=$('music-word-list');host.replaceChildren();for(const card of album.cards.filter(c=>inSong(c,songSelect.value)).map(c=>forSong(c,songSelect.value))){
 const row=el('div','music-word'),button=el('button','music-word-play','▶');button.setAttribute('aria-label','Hear '+card.ru);button.onclick=()=>clip(card);
 const text=el('div','music-word-text');text.append(el('strong','',card.ru),el('p','',card.en+(card.usage==='neutral'?'':' · '+card.usage)));
 const choices=el('div','music-understanding');choices.setAttribute('role','group');choices.setAttribute('aria-label','Understanding of '+card.ru);
 for(const [value,label] of [['not-yet','Not yet'],['partly','Partly'],['understood','Understood']]){const b=el('button','',label);b.setAttribute('aria-pressed',String(understanding[card.id]===value));b.disabled=!understandingReadable;b.onclick=()=>{const next={...understanding,[card.id]:value};try{cloudStorage.setItem(understandingKey,JSON.stringify(next));understanding=next;for(const other of choices.children)other.setAttribute('aria-pressed',String(other===b));tell('');}catch{tell('Could not save your understanding. Browser storage may be full.');}};choices.append(b);}
 row.append(button,text,choices);host.append(row);
 }host.append(el('p','music-meta',album.qualityNote));if(!understandingReadable)host.prepend(el('p','music-error','Saved understanding could not be read. Existing progress has not been changed.'));
}
let showMeanings=false;try{showMeanings=cloudStorage.getItem('voice-lyric-meanings-v1')==='true';}catch{}
let lyricWords=[],activeLyric=-1,lyricFrame=0,followLyrics=true,lyricViewport,followButton;
function setFollow(value){followLyrics=value;if(followButton)followButton.setAttribute('aria-pressed',String(value));if(value)syncLyrics(true);}
function syncLyrics(force=false){
 const index=activeLyricIndex(lyricWords,player.currentTime);if(index===activeLyric&&!force)return;
 if(activeLyric>=0){const old=lyricWords[activeLyric]?.element;old?.classList.remove('is-current');old?.removeAttribute('aria-current');old?.closest('.lyric-line')?.classList.remove('is-active-line');}
 activeLyric=index;if(index<0)return;const word=lyricWords[index].element;word.classList.add('is-current');word.setAttribute('aria-current','true');word.closest('.lyric-line')?.classList.add('is-active-line');
 if(followLyrics&&lyricViewport&&(!$('panel-listen').hidden)&&(!player.paused||force)){const box=word.getBoundingClientRect(),view=lyricViewport.getBoundingClientRect();if(box.top<view.top+50||box.bottom>view.bottom-60)lyricViewport.scrollTo({top:Math.max(0,lyricViewport.scrollTop+box.top-view.top-view.height*.4),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
}
function animateLyrics(){syncLyrics();if(!player.paused&&!player.ended)lyricFrame=requestAnimationFrame(animateLyrics);}
player.addEventListener('play',()=>{cancelAnimationFrame(lyricFrame);animateLyrics();});
player.addEventListener('pause',()=>{cancelAnimationFrame(lyricFrame);syncLyrics();});
player.addEventListener('seeked',()=>syncLyrics(true));
player.addEventListener('timeupdate',()=>syncLyrics());
function renderSongText(){const host=$('music-transcript');host.replaceChildren();lyricWords=[];activeLyric=-1;if(!transcripts){host.append(el('p','music-meta','Song text could not load. Reload to try again.'));return;}
 const toolbar=el('div','lyrics-toolbar');followButton=el('button','lyrics-follow','Follow lyrics');followButton.setAttribute('aria-pressed',String(followLyrics));followButton.onclick=()=>setFollow(!followLyrics);const controls=el('div','lyrics-controls'),meaningsButton=el('button','lyrics-follow lyrics-meanings-toggle','Word meanings');meaningsButton.setAttribute('aria-pressed',String(showMeanings));meaningsButton.onclick=()=>{showMeanings=!showMeanings;meaningsButton.setAttribute('aria-pressed',String(showMeanings));lyricViewport.classList.toggle('meanings-mode',showMeanings);try{cloudStorage.setItem('voice-lyric-meanings-v1',String(showMeanings));}catch{}syncLyrics(true);};controls.append(meaningsButton,followButton);toolbar.append(controls);host.append(toolbar);
 lyricViewport=el('div','lyrics-viewport');lyricViewport.classList.toggle('meanings-mode',showMeanings);lyricViewport.tabIndex=0;lyricViewport.setAttribute('role','region');lyricViewport.setAttribute('aria-label','Synchronized song text');lyricViewport.addEventListener('wheel',()=>setFollow(false),{passive:true});lyricViewport.addEventListener('touchmove',()=>setFollow(false),{passive:true});lyricViewport.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(e.key))setFollow(false);});
 for(const song of transcripts.songs.filter(s=>!songSelect.value||s.id===songSelect.value)){const section=el('section','music-song-text');section.setAttribute('lang','ru');section.append(el('h2','',song.title));const track=album.songs.find(s=>s.id===song.id);
 for(const line of song.lines){const words=line.words||line.text.split(/\s+/).map(text=>({text}));let row;words.forEach((word,i)=>{if(i%8===0){row=el('p','lyric-line');section.append(row);}const timed=Number.isFinite(word.start)&&word.end>word.start;const target=lyricSeekTarget(words,i,line.start),token=el('button','lyric-word',word.text);token.type='button';token.setAttribute('aria-label',(target.approximate?'Play near ':'Play from ')+word.text);token.title=target.approximate?'Play near this word — timing is approximate':'Play from this word';token.onclick=()=>{setFollow(true);play(target.time,track.end);};if(timed)lyricWords.push({...word,element:token});const pair=el('span','lyric-token'),meaning=el('small','word-gloss',word.meaning||'unavailable');meaning.lang='en';if(word.meaningUncertain)meaning.classList.add('meaning-uncertain');pair.append(token,meaning);row.append(pair,document.createTextNode(' '));});}
 if(!song.lines.length)section.append(el('p','music-meta','No transcription available.'));lyricViewport.append(section);}
 host.append(lyricViewport);lyricWords.sort((a,b)=>a.start-b.start);syncLyrics();
}
$('memorize-deck').onchange=e=>{$('common-deck').hidden=e.target.value!=='common';$('music-memorize').hidden=e.target.value!=='album';pauseMusic();};
new MutationObserver(()=>{if($('panel-listen').hidden)pauseMusic();}).observe($('panel-listen'),{attributes:true,attributeFilter:['hidden']});
new MutationObserver(()=>{if(document.querySelector('main').hidden)pauseMusic();}).observe(document.querySelector('main'),{attributes:true,attributeFilter:['hidden']});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseMusic();});
setInterval(()=>studies.forEach(s=>s.refresh()),15000);
try{const r=await fetch('/music/album.json');if(!r.ok)throw Error();album=await r.json();try{const text=await fetch('/music/transcripts.json');if(text.ok)transcripts=await text.json();}catch{}try{const common=await fetch('/flashcards-1000.json');if(common.ok)commonWords=await common.json();}catch{}for(const s of album.songs){const o=el('option','',s.title);o.value=s.id;songSelect.append(o);}const study=createMusicStudy($('music-memorize'),{album,commonWords,pauseAudio:pauseMusic});if(study)studies.push(study);songSelect.value=album.songs[0]?.id||'';songSelect.onchange=()=>{pauseMusic();const song=album.songs.find(s=>s.id===songSelect.value);pendingSongStart=song?.start||0;stopAt=song?.end||album.duration;if(preparedAudio&&player.currentSrc.startsWith('blob:')&&player.readyState>=1){player.currentTime=pendingSongStart;pendingSongStart=null;}renderWords();renderSongText();updateTransport();};songSelect.onchange();}catch{tell('The album vocabulary could not load. Reload to try again.');}

window.addEventListener('cloud-updated',()=>{if(!album)return;understanding=JSON.parse(cloudStorage.getItem(understandingKey)||'{}');renderWords();});
