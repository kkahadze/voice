import {Transcript} from './transcript.js';
import {conversationContext} from './conversation-context.js';
import {languageApi} from './languages.js';

// The server owns credentials and Agents sessions. The browser owns the Live
// delegation ID, transcript snapshot, and whether a result is still relevant.
export class LessonDirector {
 constructor({sessionId,context=[],request,send,onStatus=()=>{},timers=globalThis}){
  Object.assign(this,{sessionId,context,request,send,onStatus,timers});
  this.transcript=new Transcript();this.revision=0;this.seen=new Set();this.pending=null;this.running=false;this.closed=false;this.unavailable=false;
 }
 handle(event){
  if(this.closed||this.unavailable)return;
  if(this.transcript.add(event)&&event.type==='session.input_transcript.delta'){
   this.revision++;
   if(this.active&&!this.pending)this.pending={...this.active};
   if(this.pending)this.schedule();
  }
  if(event.type==='session.delegation.created'&&event.delegation?.target==='client'&&typeof event.delegation.id==='string'&&!this.seen.has(event.delegation.id)){
   this.seen.add(event.delegation.id);this.revision++;
   this.pending={id:event.delegation.id};this.schedule();
  }
 }
 schedule(){
  this.timers.clearTimeout(this.timer);
  // Coalesce fragments; this is a snapshot, not a claim that speech has ended.
  this.timer=this.timers.setTimeout(()=>{void this.flush();},400);
 }
 async flush(){
  if(this.closed||this.unavailable||this.running||!this.pending)return;
  const active=this.pending,revision=this.revision;this.pending=null;this.active=active;this.running=true;
  const context=conversationContext({previousTranscript:this.context,transcript:this.transcript.groups()});
  try{
   if(!context.length){this.pending=active;return;}
   const response=await this.request(languageApi('/api/live/director'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({action:'move',sessionId:this.sessionId,delegationId:active.id,revision,context})});
   const result=await response.json();
   if(this.closed)return;
   if(!response.ok)throw Error('Director unavailable');
   if(revision!==this.revision||this.pending||result.revision!==revision||result.delegationId!==active.id)return;
   if(typeof result.utterance!=='string'||!result.utterance.trim()||new TextEncoder().encode(result.utterance).length>500)throw Error('Invalid director result');
   this.send({type:'session.commentary.append',event_id:'director_'+active.id+'_'+revision,delegation_id:active.id,content:result.utterance});
   this.onStatus('ready');
  }catch{
   if(!this.closed){
    this.unavailable=true;this.pending=null;
    this.onStatus('unavailable');
    this.send({type:'session.instructions.append',event_id:'director_unavailable_'+revision,delegation_id:null,content:'The lesson director is unavailable for this call. Continue teaching from the current lesson and conversation yourself. Do not delegate again or claim that learning progress has been saved. If a question needs unavailable reasoning, say so briefly.'});
   }
  }finally{
   this.active=null;this.running=false;
   if(this.pending&&!this.closed&&!this.unavailable&&context.length)this.schedule();
  }
 }
 async close(){
  if(this.closed)return;
  this.closed=true;this.pending=null;this.timers.clearTimeout(this.timer);
  try{
   const response=await this.request(languageApi('/api/live/director'),{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({action:'close',sessionId:this.sessionId})});
   const result=await response.json();
   if(!response.ok||result.cleanupPending)this.onStatus('cleanup_pending');
  }catch{this.onStatus('cleanup_pending');}
 }
}
