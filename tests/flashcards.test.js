import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {studyQueue} from '../public/spaced-repetition.js';
const cards=JSON.parse(readFileSync(new URL('../public/flashcards-1000.json',import.meta.url)));
test('deck has 1000 unique, complete words with matching stress and ordered source ranks',()=>{assert.equal(cards.length,1000);assert.equal(new Set(cards.map(c=>c.ru)).size,1000);assert.equal(new Set(cards.map(c=>c.id)).size,1000);for(const [i,c] of cards.entries()){assert.equal(c.rank,i+1);assert.ok(c.en.trim());assert.equal(c.stressed.replaceAll('\u0301',''),c.ru);assert.ok(!i||c.sourceRank>cards[i-1].sourceRank);}});
test('browse word sets retain every card in the requested scope',()=>{for(let set=1;set<=10;set++){const queue=studyQueue(cards,{},{set,browse:true});assert.equal(queue.length,100);assert.deepEqual(queue,cards.slice((set-1)*100,set*100).map(c=>c.id));}});
