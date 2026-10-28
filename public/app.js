import {activeLanguage,languageName,languageStorageKey} from './languages.js';
import {conversationContext} from './conversation-context.js';
import {LiveVoice} from './live-session.js';
import {bindVoiceBackground} from './voice-background.js';
import {Transcript} from './transcript.js';
import {assessSession} from './session-review.js';
import {pickTopic} from './topics.js';
import {getPractice,recordTopic,savePending} from './practice-store.js';
const $=s=>document.querySelector(s),audio=$('#voice-audio'),playButton=$('#enable-audio');
const buttons={talk:$('#microphone')};
const statuses={talk:$('#status')};
const conversations={talk:$('#conversation')};
let transcript=new Transcript(),checking=false,attempt=0,mode='talk',session=null,revealed=false,submitted=false,selectedTopic=null,resumeSession=null,previousTranscript=[];
const remember=value=>{try{if(value)sessionStorage.setItem(languageStorageKey('voice-finalization'),value);else sessionStorage.removeItem(languageStorageKey('voice-finalization'));}catch{}};
try{if(sessionStorage.getItem(languageStorageKey('voice-finalization')))statuses.talk.textContent='The previous conversation’s finalization could not be confirmed. Its board was not updated.';}catch{}
function renderTranscript(){const box=conversations[mode],nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90;box.replaceChildren(...[...previousTranscript,...transcript.groups()].map(g=>{const row=document.createElement('article');row.className=`transcript-row ${g.speaker}`;const label=document.createElement('span');label.className='speaker-label';label.textContent=g.speaker==='user'?(activeLanguage==='es'?'Tú':'Вы'):(activeLanguage==='es'?'Profesor':'Учитель');const text=document.createElement('p');text.textContent=g.text;row.append(label,text);return row;}));box.hidden=!transcript.fragments.length&&!previousTranscript.length;if(nearBottom)box.scrollTop=box.scrollHeight;}
async function playAudio(){try{await audio.play();playButton.hidden=true;}catch{if(audio.srcObject)playButton.hidden=false;}}
let lastCheckpoint=0;
function checkpoint(force=false){if(!session||submitted||!voice.current)return;if(!force&&Date.now()-lastCheckpoint<5000)return;lastCheckpoint=Date.now();try{savePending({...session,status:'active',incomplete:false,transcript:transcript.groups().map(({speaker,text})=>({speaker,text}))});}catch{document.querySelector('#cloud-sync-message').textContent='Could not save this conversation. Keep the page open and retry sync.';document.querySelector('#cloud-sync').hidden=false;}}
function finish(incomplete=false){if(!session||submitted)return;submitted=true;const data={...session,transcript:transcript.groups().map(({speaker,text})=>({speaker,text})),incomplete,transcriptRevealed:revealed};resumeSession=data;$('#new-conversation').hidden=false;buttons.talk.setAttribute('aria-label','Continue conversation');assessSession(data);}
const voice=new LiveVoice({
 onState({state,message,incomplete,finalized,microphonePaused}){
  background.update({state,microphonePaused});
  $('#resume-microphone').hidden=state!=='active'||!microphonePaused;
  const active=['active','closing'].includes(state);document.body.classList.toggle('active',active);document.body.classList.toggle('voice-connecting',state==='connecting');
  for(const [m,b] of Object.entries(buttons)){b.disabled=state==='closing'||(m!==mode&&!!voice.current);b.setAttribute('aria-pressed',String(m===mode&&active));}
  const button=buttons[mode];button.setAttribute('aria-label',state==='active'?'End conversation':state==='connecting'?'Cancel connection':state==='closing'?'Finishing conversation':'Start conversation');
  statuses[mode].textContent=message;statuses[mode].classList.toggle('is-error',state==='error');
  $('#hint').textContent=state==='active'?`Speak ${languageName}. Tap the microphone to finish.`:'';
  remember(incomplete?'incomplete':['connecting','active','closing'].includes(state)?'pending':null);
  if(finalized)finish(false);else if(state==='error'&&session)finish(true);
 },
 onAudio(stream){audio.srcObject=stream;if(stream)playAudio();else{audio.pause();playButton.hidden=true;}},
 onEvent(event){if(event.type==='session.started'){transcript=new Transcript();submitted=false;session={id:voice.current?.id||crypto.randomUUID(),mode,language:activeLanguage,topicId:selectedTopic?.id||null,previousTranscript,continuedFrom:resumeSession?.id||null,at:Date.now()};$('#new-conversation').hidden=true;if(selectedTopic&&!resumeSession){try{recordTopic(mode,selectedTopic.id);}catch{}}revealed=false;renderTranscript();}if(transcript.add(event)){renderTranscript();checkpoint();}if(event.type==='error')statuses[mode].textContent='The teacher encountered a problem. Try again or end the session.';},
});
setInterval(()=>checkpoint(),5000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpoint(true);});
const background=bindVoiceBackground({voice,audio,playAudio,languageName});
for(const [nextMode,button] of Object.entries(buttons))button.addEventListener('click',async()=>{
 if(voice.current){voice.close();return;}if(checking)return;if(window.spanishListening?.isBusy()){window.spanishListening.stop();statuses[nextMode].textContent='Finishing your listening attempt. Start talking once its review is saved.';return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){statuses[nextMode].textContent='Voice needs microphone support on HTTPS.';return;}
 mode=nextMode;$('#voice-audio').after(playButton);session=null;submitted=false;const currentAttempt=++attempt;checking=true;button.disabled=true;statuses[mode].textContent='Checking connection…';
 try{const ready=await window.apiConnection.ensure();if(currentAttempt!==attempt)return;if(ready){checking=false;button.disabled=false;const practice=getPractice();selectedTopic=resumeSession?practice.cards.find(c=>c.id===resumeSession.topicId):pickTopic(practice.cards,mode,practice.topicRecent?.[mode]||[]);previousTranscript=conversationContext(resumeSession);await voice.start({mode,topicId:resumeSession?undefined:selectedTopic?.id,context:previousTranscript.length?previousTranscript:undefined,targetId:window.voiceLessonTarget||undefined});window.voiceLessonTarget=null;}else statuses[mode].textContent='';}catch{statuses[mode].textContent='Could not read your saved topics. Reload the app and try again.';}finally{checking=false;button.disabled=voice.state==='closing';}
});
playButton.addEventListener('click',playAudio);
$('#resume-microphone').addEventListener('click',()=>background.resumeMicrophone());
window.voice={isBusy(){return checking||!!voice.current||['connecting','active','closing'].includes(voice.state);},continueSession(saved){if(voice.current||checking)return;resumeSession=saved;previousTranscript=conversationContext(saved);transcript=new Transcript();renderTranscript();$('#new-conversation').hidden=false;buttons.talk.click();},stop(){attempt++;voice.close();},get state(){return voice.state;}};
window.addEventListener('pagehide',()=>{if(session&&!submitted){try{savePending({...session,incomplete:true,transcript:transcript.groups().map(({speaker,text})=>({speaker,text}))});}catch{}}window.voice.stop();});

$('#new-conversation').onclick=()=>{if(voice.current||checking)return;resumeSession=null;previousTranscript=[];transcript=new Transcript();session=null;renderTranscript();$('#new-conversation').hidden=true;statuses.talk.textContent='';buttons.talk.setAttribute('aria-label','Start conversation');};
