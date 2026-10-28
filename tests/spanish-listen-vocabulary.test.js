import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSpanishListeningVocabulary} from '../public/spanish-listen-vocabulary.js';
import {spanishListenCurriculum} from '../public/spanish-curriculum.js';
import {inSong,forSong} from '../public/music-cards.js';
import {musicQueue,loadMusicProgress,review} from '../public/music-state.js';

test('Spanish listening vocabulary respects accents, token boundaries, and exact multiword matches',()=>{
 const lessons=[{id:'one',topic:'One',script:'Sí, la casa está aquí. ¿Por favor? Un mapa.'},{id:'two',topic:'Two',script:'Si cambia el plan, volvemos a casa.'}];
 const deck=[['sí','yes'],['si','if'],['casa','house'],['por favor','please'],['mapa','map'],['mar','sea'],['casas','houses'],['aquí','here'],['aqui','not a valid accent match']].map(([es,en])=>({es,en}));
 const {cards}=buildSpanishListeningVocabulary(lessons,deck);
 assert.deepEqual(cards.map(c=>c.es),['sí','si','casa','por favor','mapa','aquí']);
 assert.equal(cards.find(c=>c.es==='casa').occurrences.length,2);
 assert.equal(inSong(cards.find(c=>c.es==='sí'),'one'),true);assert.equal(inSong(cards.find(c=>c.es==='sí'),'two'),false);
 assert.equal(forSong(cards.find(c=>c.es==='casa'),'two').song,'Two');
 assert.ok(cards.every(c=>!('start' in c)&&!('end' in c)));
 const decomposed=buildSpanishListeningVocabulary([{id:'a',script:'SI\u0301'}],[{es:'sí',en:'yes'}]);assert.equal(decomposed.cards.length,1);
});

test('Spanish listening deck has stable unique identities, sourced meanings, and working shared FSRS schedules',()=>{
 const deck=JSON.parse(readFileSync(new URL('../public/flashcards-es-1000.json',import.meta.url)));
 const {cards}=buildSpanishListeningVocabulary(spanishListenCurriculum,deck);
 assert.ok(cards.length>100);assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
 for(const c of cards){assert.equal(c.en,deck.find(w=>w.es===c.es).en);assert.ok(c.occurrences.length);assert.ok(c.occurrences.every(o=>spanishListenCurriculum.some(l=>l.id===o.songId)));}
 const reversed=buildSpanishListeningVocabulary([...spanishListenCurriculum].reverse(),[...deck].reverse()).cards;
 for(const c of cards)assert.equal(reversed.find(w=>w.es===c.es).id,c.id);
 const now=Date.now(),first=cards[0],progress={[first.id]:review({},4,now)};
 const reloaded=loadMusicProgress(cards,{getItem:()=>JSON.stringify(progress)});
 assert.equal(reloaded[first.id].card.due.getTime(),progress[first.id].card.due.getTime());
 assert.ok(!musicQueue(cards,reloaded,first.songId,now).includes(first.id));
 assert.ok(musicQueue(cards,{},first.songId,now).includes(first.id));
});
