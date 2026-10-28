import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {studyQueue} from '../public/spaced-repetition.js';
import {spanishTalkCurriculum as talk,spanishListenCurriculum as listen,spanishTopicCurriculum as topics} from '../public/spanish-curriculum.js';
const cards=JSON.parse(readFileSync(new URL('../public/flashcards-es-1000.json',import.meta.url)));
test('Spanish vocabulary has 1000 distinct complete cards, real accents, stable IDs and curated ranks',()=>{
 assert.equal(cards.length,1000);assert.equal(new Set(cards.map(c=>c.es)).size,1000);assert.equal(new Set(cards.map(c=>c.id)).size,1000);
 for(const [i,c] of cards.entries()){
  assert.equal(c.rank,i+1);assert.equal(c.es,c.es.trim());assert.equal(c.stressed,c.es);assert.ok(c.en.trim());assert.match(c.id,/^es-word-/);assert.ok(!/[\u0400-\u04ff\u30a0-\u30ff]/u.test(c.es));
 }
 for(const word of ['el','la','los','las','un','una','unos','unas','qué','quién','cómo','cuándo','dónde','cuánto','año','corazón','miércoles','aprender','desacuerdo','pronunciación'])assert.ok(cards.some(c=>c.es===word),word);
 assert.match(cards.find(c=>c.es==='ser').en,/identity/);assert.match(cards.find(c=>c.es==='estar').en,/state/);
 assert.deepEqual(studyQueue(cards,{},{set:10,browse:true}),cards.slice(900).map(c=>c.id));
});
test('Spanish speaking and listening provide complete original tasks at every chapter',()=>{
 assert.equal(talk.length,48);assert.equal(listen.length,16);assert.equal(topics.length,60);
 const all=[...talk,...listen,...topics];assert.equal(new Set(all.map(c=>c.id)).size,all.length);
 for(const c of all){assert.match(c.id,/^es-/);assert.equal(c.language,'es');assert.equal(c.stage,0);assert.ok(c.front.trim());assert.ok(c.back.trim());assert.ok(!/[\u0400-\u04ff]/u.test(JSON.stringify(c)));}
 for(const level of ['B1','B2','C1','C2']){assert.equal(talk.filter(c=>c.level===level).length,12);assert.equal(listen.filter(c=>c.level===level).length,4);}
 for(const c of listen){assert.ok(c.script.length>180);assert.ok(c.question.includes('?'));assert.ok(c.answer.length>35);assert.notEqual(c.front,c.answer);}
 for(const c of topics){assert.ok(c.script.length>80);assert.ok(c.prompt.endsWith('?'));assert.ok(c.question.includes('?'));assert.ok(c.answer.trim());assert.equal(c.ru,c.es);}
});
test('advanced listening asks learners to interpret evidence instead of supplying the interpretation',()=>{
 const agreement=listen.find(c=>c.id==='es-listen-formal-agreement');assert.match(agreement.script,/El comité aprueba la iniciativa/);assert.match(agreement.question,/preciso/);assert.doesNotMatch(agreement.script,/compromiso operativo|aprobación definitiva/);
 const irony=listen.find(c=>c.id==='es-listen-ironic-praise');assert.doesNotMatch(irony.script,/interpretación irónica|lectura literal/);
 const responsibility=listen.find(c=>c.id==='es-listen-limits-of-responsibility');assert.match(responsibility.script,/Nadie la obligó/);assert.match(responsibility.script,/No digo que la amenazaran/);
});
