import {LiveVoice} from './live-session.js';
import {Transcript} from './transcript.js';
import {bindVoiceBackground} from './voice-background.js';
import {assessSession} from './session-review.js';
import {savePending,getPractice} from './practice-store.js';
import {spanishListenCurriculum} from './spanish-curriculum.js';
import {cloudStorage,cloudReady} from './cloud-store.js';
import {languageApi} from './languages.js';
import {createMusicStudy} from './music-study.js';
import {buildSpanishListeningVocabulary} from './spanish-listen-vocabulary.js';
import {inSong} from './music-cards.js';

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const wordKey=value=>value.toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]/gu,'');

// Both languages bind to the same player markup and music.css. Only the
// content and playback provider differ: Spanish uses live listening lessons.
export async function initSpanishListening(host) {
 if(host.dataset.initialized)return window.spanishListening;
 host.dataset.initialized='true';await cloudReady;
 const $=id=>document.getElementById(id),panel=host.closest('[role="tabpanel"]'),picker=$('music-song'),start=$('music-toggle'),previous=$('music-previous'),next=$('music-next'),audio=$('music-player'),status=$('music-status');
 const lessons=spanishListenCurriculum;
 let selected=lessons[0],transcript=new Transcript(),session=null,submitted=false,checking=false,reviewing=false,attempt=0,lastCheckpoint=0,revealed=false,hasChosen=false,reviewTask=Promise.resolve();
 let showMeanings=cloudStorage.getItem('voice-lyric-meanings-v1')==='true',followText=false;
 const revealedLessons=new Set();
 let album={cards:[],qualityNote:''},dictionary=new Map(),understanding={},understandingReadable=true;
 try{understanding=JSON.parse(cloudStorage.getItem('voice-music-understanding-v1')||'{}');if(!understanding||typeof understanding!=='object'||Array.isArray(understanding))throw Error();}catch{understandingReadable=false;}
 $('memorize-deck').onchange=e=>{$('common-deck').hidden=e.target.value!=='common';$('music-memorize').hidden=e.target.value!=='album';stop();};
 document.querySelector('label[for="music-song"]').textContent='Listening exercise';picker.setAttribute('aria-label','Listening exercise');
 picker.replaceChildren(...lessons.map(lesson=>{const option=el('option','',`${lesson.level} · ${lesson.topic}`);option.value=lesson.id;return option;}));
 previous.setAttribute('aria-label','Previous exercise');next.setAttribute('aria-label','Next exercise');
 const textHost=$('music-transcript');textHost.setAttribute('aria-label','Listening text');
 const toolbar=el('div','lyrics-toolbar'),controls=el('div','lyrics-controls');
 const meaningsButton=el('button','lyrics-follow lyrics-meanings-toggle','Word meanings'),followButton=el('button','lyrics-follow','Follow text');
 controls.append(meaningsButton,followButton);toolbar.append(controls);
 const viewport=el('div','lyrics-viewport');viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','Listening text');
 textHost.replaceChildren(toolbar,viewport);
 const audioEnable=el('button','dev-button','Tap to hear the teacher'),resume=el('button','dev-button','Resume microphone');audioEnable.hidden=true;resume.hidden=true;host.append(audioEnable,resume);
 audio.autoplay=true;audio.playsInline=true;delete audio.dataset.source;

 const busy=()=>checking||reviewing||['connecting','active','closing'].includes(voice.state);
 function updateControls(){
  picker.disabled=busy();const index=lessons.indexOf(selected);previous.disabled=busy()||index===0;next.disabled=busy()||index===lessons.length-1;
  start.disabled=checking||reviewing||voice.state==='closing';start.dataset.playing=String(!!voice.current);start.setAttribute('aria-label',voice.state==='active'?'Finish listening':voice.state==='connecting'?'Cancel connection':'Play');start.setAttribute('aria-busy',String(checking||reviewing||voice.state==='connecting'));
  for(const button of $('music-word-list').querySelectorAll('.music-word-play'))button.disabled=busy();
 }
 function markReadingSupport(){revealed=true;revealedLessons.add(selected.id);checkpoint(true);}
 function renderText(){
  meaningsButton.setAttribute('aria-pressed',String(showMeanings));followButton.setAttribute('aria-pressed',String(followText));viewport.classList.toggle('meanings-mode',showMeanings);
  const section=el('section','music-song-text');section.append(el('h2','',selected.topic));
  if(showMeanings||followText){
   markReadingSupport();section.lang='es';
   const words=selected.script.split(/\s+/);let line;
   words.forEach((word,index)=>{if(index%8===0){line=el('p','lyric-line');section.append(line);}const token=el('span','lyric-word',word),pair=el('span','lyric-token'),meaning=el('small','word-gloss',dictionary.get(wordKey(word))||'—');meaning.lang='en';pair.append(token,meaning);line.append(pair,document.createTextNode(' '));});
   const note=el('p','music-transcript-note','Reading support is on. This attempt will not advance listening progress.');note.lang='en';section.append(note);
   const turns=transcript.groups();for(const turn of turns){const row=el('p','lyric-line');row.append(el('strong','',turn.speaker==='user'?'Tú: ':'Tu profesor: '),document.createTextNode(turn.text));section.append(row);}
  }else{
   section.append(el('p','lyric-line',selected.front),el('p','music-transcript-note',revealed?'You have opened reading support for this passage. Try a different exercise for an independent attempt.':'Press play, listen, then answer aloud. Keep Word meanings and Follow text off for an independent attempt.'));
  }
  viewport.replaceChildren(section);if(followText&&voice.state==='active')viewport.scrollTop=viewport.scrollHeight;
 }
 function renderWords(){
  const list=$('music-word-list');list.replaceChildren();
  for(const card of album.cards.filter(card=>inSong(card,selected.id))){
   const row=el('div','music-word'),play=el('button','music-word-play','▶');play.setAttribute('aria-label','Hear '+card.ru+' in this exercise');play.disabled=busy();play.onclick=()=>{markReadingSupport();void startAttempt();};
   const text=el('div','music-word-text');text.append(el('strong','',card.ru),el('p','',card.en));
   const choices=el('div','music-understanding');choices.setAttribute('role','group');choices.setAttribute('aria-label','Understanding of '+card.ru);
   for(const [value,label] of [['not-yet','Not yet'],['partly','Partly'],['understood','Understood']]){const button=el('button','',label);button.disabled=!understandingReadable;button.setAttribute('aria-pressed',String(understanding[card.id]===value));button.onclick=()=>{const saved={...understanding,[card.id]:value};try{cloudStorage.setItem('voice-music-understanding-v1',JSON.stringify(saved));understanding=saved;renderWords();}catch{status.textContent='Could not save your understanding. Retry sync.';}};choices.append(button);}
   row.append(play,text,choices);list.append(row);
  }
  list.append(el('p','music-meta',album.qualityNote));if(!understandingReadable)list.prepend(el('p','music-error','Saved understanding could not be read. Existing progress has not been changed.'));
 }
 function selectLesson(lesson){selected=lesson;picker.value=lesson.id;transcript=new Transcript();session=null;revealed=revealedLessons.has(lesson.id);followText=false;if($('music-word-list').closest('details').open)markReadingSupport();renderText();renderWords();updateControls();status.textContent='';}
 function snapshot(incomplete=false){return {...session,language:'es',incomplete,transcriptRevealed:revealed,transcript:transcript.groups().map(({speaker,text})=>({speaker,text}))};}
 function checkpoint(force=false){if(!session||submitted||!voice.current||(!force&&Date.now()-lastCheckpoint<5000))return;lastCheckpoint=Date.now();try{savePending({...snapshot(),status:'active'});}catch{status.textContent='Could not save this attempt yet. Keep this page open and retry sync.';}}
 function finish(incomplete){
  if(!session||submitted)return;submitted=true;reviewing=true;updateControls();const record=snapshot(incomplete);
  status.textContent=incomplete?'This attempt ended before it could finish. No progress was awarded.':'Reviewing your listening attempt…';
  reviewTask=(async()=>{try{await assessSession(record);const saved=getPractice().sessions.find(item=>item.id===record.id);status.textContent=incomplete?'This attempt was saved as incomplete. Start again when you’re ready.':saved?.status==='applied'?(record.transcriptRevealed?'Supported practice saved. Try a different passage with reading support off next time.':'Reviewed and saved to your Spanish journey.'):'Your attempt is saved. Retry its review in Journey.';}catch{status.textContent='Your review is waiting. Open Journey to retry.';}finally{reviewing=false;updateControls();}})();
 }
 async function playAudio(){try{await audio.play();audioEnable.hidden=true;}catch{audioEnable.hidden=!audio.srcObject;}}
 const voice=new LiveVoice({
  onAudio(stream){audio.srcObject=stream;if(stream)void playAudio();else{audio.pause();audioEnable.hidden=true;}},
  onState({state,message,finalized,microphonePaused}){background.update({state,microphonePaused});resume.hidden=state!=='active'||!microphonePaused;updateControls();if(message)status.textContent=message;if(finalized)finish(false);else if(state==='error'&&session)finish(true);},
  onEvent(event){if(event.type==='session.started'){transcript=new Transcript();submitted=false;session={id:voice.current?.id||crypto.randomUUID(),mode:'listen',lessonId:selected.id,language:'es',at:Date.now()};lastCheckpoint=0;renderText();}if(transcript.add(event)){renderText();checkpoint();}if(event.type==='error')status.textContent='The teacher had trouble responding. Try speaking again or finish this attempt.';},
 });
 const background=bindVoiceBackground({voice,audio,playAudio,languageName:'Spanish'});
 function stop(){attempt++;voice.close();}
 async function startAttempt(){
  if(voice.current){stop();return;}if(checking||reviewing)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){status.textContent='Listening practice needs microphone support on HTTPS.';return;}
  if(window.voice?.isBusy?.()||['connecting','active','closing'].includes(window.voice?.state)){window.voice.stop();status.textContent='Finish your Talk conversation first, then start listening.';return;}
  const currentAttempt=++attempt;checking=true;updateControls();status.textContent='Checking your connection…';session=null;submitted=false;
  try{const ready=await window.apiConnection.ensure();if(currentAttempt!==attempt)return;if(!ready){status.textContent='Connect your API key to begin.';return;}transcript=new Transcript();renderText();checking=false;await voice.start({mode:'listen',lessonId:selected.id});}catch{status.textContent='Could not start listening. Please try again.';}finally{checking=false;updateControls();}
 }
 start.onclick=startAttempt;
 picker.onchange=()=>{hasChosen=true;selectLesson(lessons.find(lesson=>lesson.id===picker.value)||selected);};
 previous.onclick=()=>{hasChosen=true;selectLesson(lessons[Math.max(0,lessons.indexOf(selected)-1)]);};next.onclick=()=>{hasChosen=true;selectLesson(lessons[Math.min(lessons.length-1,lessons.indexOf(selected)+1)]);};
 meaningsButton.onclick=()=>{showMeanings=!showMeanings;try{cloudStorage.setItem('voice-lyric-meanings-v1',String(showMeanings));}catch{}renderText();};
 followButton.onclick=()=>{followText=!followText;renderText();};
 const stopFollowing=()=>{if(followText){followText=false;followButton.setAttribute('aria-pressed','false');}};
 viewport.addEventListener('wheel',stopFollowing,{passive:true});viewport.addEventListener('touchmove',stopFollowing,{passive:true});
 $('music-word-list').closest('details').addEventListener('toggle',event=>{if(event.target.open)markReadingSupport();});
 audioEnable.onclick=playAudio;resume.onclick=()=>background.resumeMicrophone();
 new MutationObserver(()=>{if(panel.hidden)stop();}).observe(panel,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(()=>{if(document.querySelector('main').hidden)stop();}).observe(document.querySelector('main'),{attributes:true,attributeFilter:['hidden']});
 const checkpointTimer=setInterval(()=>checkpoint(),5000);document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpoint(true);});window.addEventListener('pagehide',()=>{clearInterval(checkpointTimer);if(session&&!submitted)try{savePending(snapshot(true));}catch{}voice.close();});
 selectLesson(selected);
 const controller={stop,get state(){return voice.state;},isBusy:busy,waitForReview:()=>reviewTask};window.spanishListening=controller;
 fetch(languageApi('/api/journey'),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)}).then(response=>response.ok?response.json():null).then(journey=>{if(journey&&!hasChosen&&!busy()){const lesson=lessons.find(lesson=>lesson.level===journey.current);if(lesson)selectLesson(lesson);}}).catch(()=>{});
 try{
  const response=await fetch('/flashcards-es-1000.json');if(!response.ok)throw Error();const deck=await response.json();dictionary=new Map(deck.map(card=>[wordKey(card.es||card.ru),card.en]));album=buildSpanishListeningVocabulary(lessons,deck);
  const study=createMusicStudy($('music-memorize'),{album,commonWords:deck,pauseAudio:stop});const studyTimer=setInterval(()=>study?.refresh(),15000);window.addEventListener('pagehide',()=>clearInterval(studyTimer),{once:true});renderWords();renderText();
 }catch{$('music-memorize').textContent='Listening vocabulary could not load. Reload to try again.';}
 window.addEventListener('cloud-updated',()=>{try{understanding=JSON.parse(cloudStorage.getItem('voice-music-understanding-v1')||'{}');}catch{}renderWords();});
 return controller;
}
