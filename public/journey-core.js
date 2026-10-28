// CEFR-inspired practice objectives, not a certification scale.
export const levels=['B1','B2','C1','C2'];
export const domains=[['interaction','Conversation'],['accuracy','Grammar'],['range','Expression'],['discourse','Structure'],['interpretation','Meaning'],['register','Register']];
const rows={
 B1:[
 ['Keep a conversation going','Ask follow-up questions, clarify a misunderstanding, and respond independently on a familiar topic.','Спланируйте встречу с другом: уточни детали, предложи вариант и реши одно недоразумение.'],
 ['Make everyday grammar reliable','Use tense, case and aspect clearly enough to describe familiar events without losing the intended meaning.','Расскажи, что ты делал вчера и что успел закончить. Затем объясни свои планы на завтра.'],
 ['Find another way to say it','Describe an unfamiliar word using familiar language and a concrete example.','Объясни, что такое полезная вещь дома, не называя её. Помоги собеседнику угадать.'],
 ['Tell a connected story','Link events in a clear order and explain a reason and a result.','Расскажи о небольшом неожиданном событии: что случилось сначала, почему и чем всё закончилось?'],
 ['Understand the point','Explain the main point and a supporting detail in a short exchange, using your own words.','Учитель рассказывает короткую историю с изменением планов. Объясни, что изменилось и почему.'],
 ['Choose a suitable tone','Distinguish a friendly request from a polite request to someone unfamiliar.','Попроси друга помочь, а затем обратись с похожей просьбой к незнакомому человеку.']
 ],
 B2:[
 ['Negotiate a real disagreement','Defend a position, respond to objections and propose a workable compromise.','Обсудите, стоит ли работать из дома. Ответь на возражение и предложи компромисс.'],
 ['Control complex sentences','Use subordinate clauses, aspect and conditional constructions accurately in an extended explanation.','Объясни, как изменился бы твой город, если бы общественный транспорт стал бесплатным.'],
 ['Express a precise viewpoint','Choose varied expressions and paraphrase a specific idea without changing its meaning.','Сравни два способа учиться и объясни преимущества каждого без повторения одних и тех же слов.'],
 ['Build an argument','Organize a position, evidence, a counterargument and a clear conclusion.','Стоит ли ограничить телефоны на работе? Представь обе стороны и обоснуй вывод.'],
 ['Follow reasoning','Distinguish a speaker’s claim from their reasons and explain an implied consequence.','Учитель приводит два довода за изменение рабочего графика. Объясни их связь и возможный недостаток.'],
 ['Adapt to the situation','Express the same message appropriately in casual and professional settings.','Объясни задержку другу, затем коллеге: сохрани смысл, но измени стиль.']
 ],
 C1:[
 ['Handle a complex discussion','Connect contributions, challenge assumptions tactfully and develop an unfamiliar issue.','Обсудите, кто несёт ответственность за решения алгоритмов. Уточни предпосылку и развей чужой аргумент.'],
 ['Sustain grammatical control','Maintain accuracy through complex reasoning and correct a substantive slip independently.','Объясни последствия решения, учитывая условия, исключения и альтернативные исходы.'],
 ['Choose nuance deliberately','Use precise collocations and distinguish closely related meanings on an abstract topic.','Различи свободу, независимость и самостоятельность на конкретных примерах.'],
 ['Synthesize competing ideas','Integrate contrasting accounts into a coherent explanation without flattening their differences.','Учитель предлагает две позиции о сохранении культурного наследия. Сопоставь их и выстрой собственный вывод.'],
 ['Read between the lines','Identify an unstated assumption or cautious disagreement and justify your interpretation.','Учитель выражает сомнение косвенно. Объясни, что подразумевается и какие слова это показывают.'],
 ['Use register with intention','Adjust tone for persuasion, diplomacy and emphasis while preserving precision.','Откажи в предложении дипломатично, затем убеди другую аудиторию пересмотреть его.']
 ],
 C2:[
 ['Navigate layered disagreement','Reframe a complex disagreement, integrate subtle qualifications and move the exchange forward.','Два участника спорят о границах свободы слова, вкладывая разный смысл в термины. Переформулируй спор и найди точку для содержательного диалога.'],
 ['Keep precision under complexity','Maintain reliable grammatical control while reformulating intricate, qualified ideas.','Передай сложное утверждение с оговорками несколькими способами, сохранив условность, временные отношения и точный смысл.'],
 ['Express fine distinctions','Reformulate subtle meaning, emphasis and ambiguity with idiomatic precision.','Сравни «он уступил», «он согласился» и «он смирился»: создай контексты и объясни оттенки без упрощения.'],
 ['Shape a sophisticated account','Reconstruct complex material with an intentional structure, calibrated emphasis and a precise conclusion.','Сведи три противоречивых объяснения общественного явления в связный анализ, явно сохранив неопределённость.'],
 ['Interpret ambiguity responsibly','Compare plausible readings of irony or ambiguity and explain what evidence distinguishes them.','Учитель предлагает неоднозначную реплику. Дай два возможных прочтения и объясни, какого контекста не хватает для уверенного вывода.'],
 ['Move flexibly between voices','Shift audience, register and rhetorical effect without losing subtle meaning.','Передай одну сложную идею как официальное заключение, дружеский совет и сдержанную иронию. Объясни, что изменилось.']
 ]
};
const spanishRows={
 B1:[
 ['Keep a conversation going','Ask follow-up questions, clarify a misunderstanding, and respond independently on a familiar topic.','Organiza una salida con un amigo: pregunta por los detalles, propón un plan y aclara un malentendido.'],
 ['Make everyday grammar reliable','Use common past tenses, agreement, and ser or estar clearly enough to describe familiar events.','Cuenta qué hacías ayer cuando cambió tu plan, qué hiciste después y cómo te sentías.'],
 ['Find another way to say it','Describe an unfamiliar word using familiar language and a concrete example.','Describe un objeto útil de tu casa sin nombrarlo. Explica para qué sirve y ayuda al profesor a adivinarlo.'],
 ['Tell a connected story','Link events in a clear order and explain a reason and a result.','Cuenta una pequeña sorpresa: ¿qué pasó primero, por qué ocurrió y cómo terminó?'],
 ['Understand the point','Explain the main point and a supporting detail in a short exchange, using your own words.','El profesor cuenta una historia breve sobre un cambio de planes. Explica qué cambió y por qué.'],
 ['Choose a suitable tone','Distinguish a friendly request from a polite request to someone unfamiliar.','Pide ayuda a un amigo y luego haz una petición parecida a una persona desconocida. Elige tú o usted según el contexto.']
 ],
 B2:[
 ['Negotiate a real disagreement','Defend a position, respond to objections and propose a workable compromise.','Debatid si conviene trabajar desde casa. Responde a una objeción y propone un acuerdo que tenga en cuenta ambas posturas.'],
 ['Control complex sentences','Use subordinate clauses, the subjunctive and conditional constructions accurately in an extended explanation.','Explica qué cambiarías en tu ciudad si pudieras y qué medidas recomiendas que adopte el ayuntamiento.'],
 ['Express a precise viewpoint','Choose varied expressions and paraphrase a specific idea without changing its meaning.','Compara dos maneras de aprender y explica las ventajas de cada una sin repetir siempre las mismas expresiones.'],
 ['Build an argument','Organize a position, evidence, a counterargument and a clear conclusion.','¿Deberían limitarse los teléfonos en el trabajo? Presenta las dos posturas y justifica una conclusión.'],
 ['Follow reasoning','Distinguish a speaker’s claim from their reasons and explain an implied consequence.','El profesor expone dos razones para cambiar el horario de trabajo. Explica cómo se relacionan y señala una consecuencia posible.'],
 ['Adapt to the situation','Express the same message appropriately in casual and professional settings.','Explica un retraso a un amigo y después a un cliente. Conserva los hechos y adapta el tono.']
 ],
 C1:[
 ['Handle a complex discussion','Connect contributions, challenge assumptions tactfully and develop an unfamiliar issue.','Discutid quién debería responder por las decisiones de un algoritmo. Cuestiona una premisa con tacto y desarrolla un argumento ajeno.'],
 ['Sustain grammatical control','Maintain tense and mood control through complex reasoning and correct a substantive slip independently.','Analiza las consecuencias de una decisión, distinguiendo lo que habría ocurrido, lo que todavía puede ocurrir y lo que dudas que ocurra.'],
 ['Choose nuance deliberately','Use precise collocations and distinguish closely related meanings on an abstract topic.','Distingue entre libertad, independencia y autonomía mediante ejemplos y reformula una definición que resulte ambigua.'],
 ['Synthesize competing ideas','Integrate contrasting accounts into a coherent explanation without flattening their differences.','El profesor presenta dos posturas sobre la conservación del patrimonio. Sintetízalas y construye una conclusión que mantenga sus matices.'],
 ['Read between the lines','Identify an unstated assumption or cautious disagreement and justify your interpretation.','El profesor expresa una reserva de manera indirecta. Explica qué da a entender y qué palabras sostienen tu interpretación.'],
 ['Use register with intention','Adjust tone for persuasion, diplomacy and emphasis while preserving precision.','Rechaza una propuesta con tacto y luego intenta persuadir a otra audiencia de que la reconsidere.']
 ],
 C2:[
 ['Navigate layered disagreement','Reframe a complex disagreement, integrate subtle qualifications and move the exchange forward.','Dos personas discuten sobre libertad de expresión pero atribuyen sentidos distintos a los mismos términos. Reformula el desacuerdo y abre una vía de diálogo.'],
 ['Keep precision under complexity','Maintain reliable grammatical control while reformulating intricate ideas with qualifications and shifts of perspective.','Reformula una afirmación compleja desde varias perspectivas, conservando las relaciones temporales, la modalidad y todas sus salvedades.'],
 ['Express fine distinctions','Reformulate subtle meaning, emphasis and ambiguity with idiomatic precision.','Distingue entre «cedió», «accedió» y «se resignó». Crea contextos plausibles y reformula cada uno sin perder su matiz.'],
 ['Shape a sophisticated account','Reconstruct complex material with an intentional structure, calibrated emphasis and a precise conclusion.','Integra tres explicaciones contradictorias de un fenómeno social en un análisis coherente, señalando con precisión lo que sigue siendo incierto.'],
 ['Interpret ambiguity responsibly','Compare plausible readings of irony or ambiguity and explain what evidence distinguishes them.','El profesor propone una réplica ambigua. Expón dos lecturas posibles y precisa qué contexto permitiría distinguirlas sin atribuir intenciones infundadas.'],
 ['Move flexibly between voices','Shift audience, register and rhetorical effect without losing subtle meaning.','Expresa una idea compleja como conclusión institucional, consejo entre amigos e ironía contenida. Explica qué cambia en cada versión y qué se conserva.']
 ]
};
const makeTargets=source=>levels.flatMap(level=>domains.map(([domain,label],i)=>({id:`${level}-${domain}`,level,domain,label,title:source[level][i][0],criterion:source[level][i][1],task:source[level][i][2]})));
export const spanishTargets=makeTargets(spanishRows);
export const targetsForLanguage=(language='ru')=>language==='es'?spanishTargets:targets;
export const targets=levels.flatMap(level=>domains.map(([domain,label],i)=>({id:`${level}-${domain}`,level,domain,label,title:rows[level][i][0],criterion:rows[level][i][1],task:rows[level][i][2]})));
export const defaultSettings={goal:'Speak Russian with confidence, precision, and nuance.',interests:'',minutes:15,corrections:'balanced',memory:true,hiddenMemories:[]};
export const settingsForLanguage=(language='ru')=>({...defaultSettings,goal:`Speak ${language==='es'?'Spanish':'Russian'} with confidence, precision, and nuance.`,hiddenMemories:[]});
export const memoryKey=value=>String(value).trim().toLocaleLowerCase().replace(/\s+/g,' ');
const day=86400000;
export function buildJourney(records,now=Date.now(),language='ru') {
 const settings={...settingsForLanguage(language),...records.find(r=>r.namespace==='adaptive'&&r.id==='settings')?.value};
 const sessions=records.filter(r=>r.namespace==='sessions'&&r.value?.status==='applied'&&!r.value?.incomplete).map(r=>r.value).sort((a,b)=>a.at-b.at);
 const reviewed=sessions.filter(s=>s.assessment?.learning?.version===1);
 const evidence=reviewed.flatMap(s=>(s.assessment.learning.observations||[]).map(o=>({...o,sessionId:s.id,at:s.at,context:s.assessment.learning.context||'unknown'})));
 const skills=targetsForLanguage(language).map(target=>{
  const all=evidence.filter(e=>e.targetId===target.id).sort((a,b)=>a.at-b.at);
  const recent=all.slice(-6),success=recent.filter(e=>e.outcome==='independent');
  const distinct=new Set(success.map(e=>e.sessionId)).size,contexts=new Set(success.map(e=>e.context)).size;
  const mastered=all.some((_,i)=>{const window=all.slice(Math.max(0,i-5),i+1),wins=window.filter(e=>e.outcome==='independent');return new Set(wins.map(e=>e.sessionId)).size>=3&&new Set(wins.map(e=>e.context)).size>=2&&wins.at(-1).at-wins[0].at>=day&&window.slice(-3).every(e=>e.outcome==='independent');});
  const last=all.at(-1);const due=last?last.at+(last.outcome==='needs_practice'?0:[2,7,21,45][Math.min(3,Math.max(0,distinct-1))]*day):null;
  return {...target,evidence:all.slice(-6),successes:distinct,contexts,mastered,due,lastAt:last?.at||0,status:last?.outcome==='needs_practice'?'Revisit':mastered?'Established':all.length?'Developing':'Not observed'};
 });
 const chapters=levels.map(level=>({level,complete:skills.filter(s=>s.level===level&&s.mastered).length,total:6}));
 const current=chapters.find(c=>c.complete<c.total)?.level||'C2';
 const memories=new Map(),repairs=new Map();
 for(const s of reviewed){
  const l=s.assessment.learning;
  if(settings.memory)for(const m of l.memories||[]){const id=memoryKey(m.text);if(!settings.hiddenMemories.includes(id))memories.set(id,{...m,id,at:s.at,sessionId:s.id});}
  for(const r of l.repairs||[]){const id=memoryKey(r.pattern),previous=repairs.get(id);repairs.set(id,{...r,id,at:s.at,sessionId:s.id,count:(previous?.count||0)+1});}
 }
 const currentSkills=skills.filter(s=>s.level===current);
 const due=skills.filter(s=>s.due!==null&&s.due<=now&&levels.indexOf(s.level)<=levels.indexOf(current));
 const focus=due.find(s=>s.status==='Revisit')||due.find(s=>!s.mastered)||currentSkills.filter(s=>!s.mastered).sort((a,b)=>a.lastAt-b.lastAt)[0]||currentSkills[0];
 const retrieval=due.filter(s=>s.id!==focus.id).sort((a,b)=>a.due-b.due)[0]||null;
 const last=reviewed.at(-1);
 return {language,settings,current,chapters,skills,focus,retrieval,memories:[...memories.values()].slice(-24),repairs:[...repairs.values()].sort((a,b)=>b.at-a.at).slice(0,8),reviewedSessions:reviewed.length,
  recentDiscussions:reviewed.slice(-5).reverse().map(s=>({at:s.at,context:s.assessment.learning.context,summary:String(s.summary||'').slice(0,500),nextStep:String(s.assessment.learning.nextStep||'').slice(0,300)})),
  pendingHistory:sessions.filter(s=>s.transcript?.some(t=>t.speaker==='user')&&!s.assessment?.learning).length,
  lastReview:last?{at:last.at,summary:last.summary,nextStep:last.assessment.learning.nextStep,sessionId:last.id}:null,
  pendingReviews:records.filter(r=>r.namespace==='sessions'&&['pending','failed'].includes(r.value?.status)&&!r.value.incomplete&&r.value.transcript?.some(t=>t.speaker==='user')).map(r=>({id:r.id,at:r.value.at})),
  calibration:new Set(evidence.map(e=>e.sessionId)).size<3,updatedAt:last?.at||null};
}
export function makePlan(journey,topic=null,requestedTarget=null) {
 const requested=targetsForLanguage(journey.language).find(t=>t.id===requestedTarget);
 // One-level stretch is allowed, but does not confer mastery of skipped levels.
 const allowed=requested&&levels.indexOf(requested.level)<=Math.min(3,levels.indexOf(journey.current)+1);
 const focus=allowed?journey.skills.find(t=>t.id===requested.id):journey.focus;
 return {version:1,language:journey.language||'ru',level:focus.level,targetIds:[focus.id,...(journey.retrieval&&journey.retrieval.id!==focus.id?[journey.retrieval.id]:[])],focus,review:journey.retrieval,
  topic:topic||journey.settings.interests||journey.memories.filter(m=>m.category==='interest').map(m=>m.text).slice(-2).join('; ')||'everyday life, then a new context',
  minutes:journey.settings.minutes,reason:focus.status==='Revisit'?'Revisit an area that needed support.':focus.lastAt?'Build consistency in a different context.':'Explore a skill we have not observed yet.'};
}
