import {languageApi} from './languages.js';
import {flushCloud,refreshCloud} from './cloud-store.js';
import {getPractice,savePending,setAssessmentError} from './practice-store.js';
const running=new Set(),tasks=new Set();
export const waitForReviews=()=>Promise.allSettled([...tasks]);
const announce=message=>{document.querySelector('#board-notice').textContent=message;window.dispatchEvent(new CustomEvent('learning-review-status',{detail:message}));};
export function assessSession(session,options={}){const task=reviewSession(session,options);tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task));return task;}
async function reviewSession(session,{retry=false}={}){
 if(running.has(session.id))return;
 try{savePending(session);const saved=getPractice().sessions.find(s=>s.id===session.id);if(['applied','undone'].includes(saved?.status))return;if(session.incomplete){announce('Session ended before finalization. The boards were not changed.');return;}}catch{announce('Could not save this session. The boards were not changed.');return;}
 running.add(session.id);announce('Updating your learning journey…');
 let serverSaved=false;
 try{await flushCloud();if(retry&&!(await window.apiConnection.ensure()))throw Error('Reconnect your API key to retry.');const response=await fetch(languageApi('/api/practice/review'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(65000),body:JSON.stringify(session)});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not review this session.');serverSaved=!!result.persisted;if(!serverSaved)throw Error('The review was not saved. Please retry.');await refreshCloud();announce('Your conversation is reviewed and saved. Open Journey to see your next step.');
 }catch(error){if(serverSaved){announce('Review saved on the server. Reconnect to refresh your boards.');return;}const message=error.name==='TimeoutError'?'The review timed out.':error.message;try{setAssessmentError(session.id,message);}catch{}announce(`${message} Retry in Journey or Session history.`);}finally{running.delete(session.id);}
}
window.retryPracticeReview=id=>{const session=getPractice().sessions.find(s=>s.id===id);if(session&&['failed','pending'].includes(session.status))assessSession(session,{retry:true});};
