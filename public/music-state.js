import {inSong} from './music-cards.js';
import {migrateProgress,studyQueue,review,previewReview,intervalLabel,markFamiliar} from './spaced-repetition.js';
export {review,previewReview,intervalLabel,markFamiliar};
export const musicKey='voice-music-fsrs-v1';
export function loadMusicProgress(cards,storage=localStorage){return migrateProgress(JSON.parse(storage.getItem(musicKey)||'{}'),cards);}
export function musicQueue(cards,progress,songId,now=Date.now()){return studyQueue(cards.filter(c=>inSong(c,songId)),progress,{},now);}
export function csvText(cards){const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';return '\uFEFF'+[['Russian','English','Type','Usage','Song'],...cards.map(c=>[c.ru,c.en,c.type,c.usage,c.song])].map(row=>row.map(q).join(',')).join('\r\n');}
