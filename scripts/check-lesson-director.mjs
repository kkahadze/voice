// Opt-in live smoke check with synthetic dialogue only. Never logs credentials.
import {directorProvider} from '../server/director-provider.js';
import {teachingPolicy} from '../server/teaching-policy.js';
if(!process.env.OPENAI_API_KEY)throw Error('Set OPENAI_API_KEY to run this paid live check.');
const provider=directorProvider(process.env.OPENAI_API_KEY);
let sessionId;
try{
 const transcript=[{speaker:'teacher',text:'Hemos hablado de tus películas favoritas, de sus personajes y de sus finales.'},{speaker:'user',text:'Ya hemos hablado mucho de cine. Quiero otro tema.'}];
 for(let revision=1;revision<=2;revision++){
  const started=Date.now();
  const result=await provider.run({sessionId,instructions:teachingPolicy+' The practice language is Spanish.',input:JSON.stringify({revision,transcript}),submissionKey:'smoke-'+revision,onSession:async id=>{sessionId=id;}});
  console.log(JSON.stringify({revision,sessionId,turnId:result.turnId,elapsedMs:Date.now()-started,move:result.move,topic:result.topic,utterance:result.utterance}));
  if(revision===1)transcript.push({speaker:'teacher',text:result.utterance},{speaker:'user',text:'Mejor hablemos de viajes. ¿Puedes preguntarme adónde me gustaría viajar?'});
 }
}catch(error){
 console.error(JSON.stringify({status:error.status||null,type:error.name,code:error.code||null}));process.exitCode=1;
}finally{
 if(sessionId){try{await provider.close(sessionId);console.log(JSON.stringify({deleted:sessionId}));}catch(error){console.error(JSON.stringify({cleanupPending:sessionId,status:error.status||null}));process.exitCode=1;}}
}
