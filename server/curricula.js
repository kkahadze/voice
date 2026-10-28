import {talkCurriculum} from '../public/talk-curriculum.js';
import {listenCurriculum} from '../public/listen-curriculum.js';
import {topicCurriculum} from '../public/topics.js';
import {spanishTalkCurriculum,spanishListenCurriculum,spanishTopicCurriculum} from '../public/spanish-curriculum.js';
export const curriculaForLanguage=(language='ru')=>language==='es'
 ? {talk:spanishTalkCurriculum,listen:spanishListenCurriculum,topics:spanishTopicCurriculum}
 : {talk:talkCurriculum,listen:listenCurriculum,topics:topicCurriculum};
