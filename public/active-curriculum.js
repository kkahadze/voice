import {activeLanguage} from './languages.js';
import {topicCurriculum as russianTopics} from './topics.js';
import {talkCurriculum as russianTalk} from './talk-curriculum.js';
import {listenCurriculum as russianListen} from './listen-curriculum.js';
import {spanishTopicCurriculum,spanishTalkCurriculum,spanishListenCurriculum} from './spanish-curriculum.js';
export const topicCurriculum=activeLanguage==='es'?spanishTopicCurriculum:russianTopics;
export const talkCurriculum=activeLanguage==='es'?spanishTalkCurriculum:russianTalk;
export const listenCurriculum=activeLanguage==='es'?spanishListenCurriculum:russianListen;
