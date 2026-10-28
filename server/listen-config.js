import {liveConfigForLanguage} from './live-config.js';
import {curriculaForLanguage} from './curricula.js';
function modeConfig(mode='talk',lessonId,topicId,language='ru'){
 const liveConfig=liveConfigForLanguage(language);
 const {listen:listenCurriculum,topics:topicCurriculum}=curriculaForLanguage(language);
 if(!['talk','listen'].includes(mode))throw Error('Invalid mode');
 const topic=topicId?topicCurriculum.find(c=>c.id===topicId&&c.mode===mode):null;
 if(topicId&&!topic)throw Error('Invalid topic');
 if(language==='es'){
  const preference='\nLa elección de tema del alumno tiene prioridad. No abras siempre con la misma pregunta y no afirmes que has cambiado su progreso.';
  if(mode==='talk')return {...liveConfig,instructions:liveConfig.instructions+preference+(topic?`\nTema sugerido: ${topic.es||topic.ru}. Pregunta inicial: ${topic.prompt}. Desarrolla la conversación a partir de las respuestas.`:'')};
  const lesson=lessonId?listenCurriculum.find(c=>c.id===lessonId):null;
  if(lessonId&&!lesson||!lesson&&!topic)throw Error('Invalid lesson');
  return {...liveConfig,instructions:liveConfig.instructions+preference+`\nMODO AUDICIÓN EN ESPAÑOL. El pasaje seleccionado es la actividad principal. Preséntalo y léelo de forma natural cuando el alumno esté preparado. Después pregunta: ${lesson?.question||topic?.question||lesson?.front}. No muestres ni digas la respuesta antes de un intento independiente. Repite el pasaje si te lo piden. Tras la respuesta, ofrece una explicación breve y una pregunta de seguimiento sobre el significado. Mantén la práctica de comprensión auditiva. Si el alumno cambia explícitamente de tema, crea un nuevo pasaje al nivel de trabajo y comprueba la comprensión. No avances destrezas solo por repetir el texto.\nTexto: ${lesson?.script||topic.script}\nRespuesta para comprobar (no revelar antes): ${lesson?.answer||topic.answer}`};
 }
 const preference=`\n\nЕсли ученик предлагает свою тему, сразу следуй его выбору. Это важнее предложенной темы или задания. Не возвращай его к прежней теме без причины. Не начинай каждый разговор вопросом «Как прошёл твой день?». Не утверждай, что изменил прогресс: приложение оценит завершённую сессию отдельно.`;
 if(mode==='talk')return topic?{...liveConfig,instructions:liveConfig.instructions+preference+`\nПредложенная тема: ${topic.ru}. Начни с короткого приветствия и конкретного вопроса: «${topic.prompt}». Затем развивай разговор по ответам ученика. Не задавай все вопросы сразу.`}:{...liveConfig,instructions:liveConfig.instructions+preference};
 const lesson=lessonId?listenCurriculum.find(c=>c.id===lessonId):null;
 if(lessonId&&!lesson)throw Error('Invalid lesson');
 if(!lesson&&!topic)throw Error('Invalid lesson');
 return {...liveConfig,instructions:liveConfig.instructions+preference+`\n\nСейчас режим аудирования. Ориентируйся на рабочий уровень из адаптивного профиля. Начни с короткого приветствия и предложи послушать короткую историю на тему «${lesson?.topic||topic.ru}». Когда ученик готов, прочитай текст естественно и чётко, затем задай один простой вопрос. Не сообщай правильный ответ до самостоятельной попытки ученика. По просьбе повтори текст. После ответа дай короткую обратную связь. Если ученик попросит другую тему, создай новый рассказ рабочего уровня ученика на эту тему и задай вопрос по его содержанию. Продолжай аудирование, а не обычный разговор о дне.\nЗадание: ${lesson?.front||topic.question}\nТекст для чтения: ${lesson?.script||topic.script}\nОтвет для проверки (не читать заранее): ${lesson?.answer||topic.answer}`};
}

export function configForMode(mode='talk',lessonId,topicId,language='ru'){
 const config=modeConfig(mode,lessonId,topicId,language);
 const base=liveConfigForLanguage(language);
 const lessonContext=config.instructions.slice(base.instructions.length);
 return {...config,delegation:{...config.delegation,responses:{...config.delegation.responses,instructions:config.delegation.responses.instructions+lessonContext}}};
}
