import test from 'node:test';
import assert from 'node:assert/strict';
import {musicQueue,loadMusicProgress,review,csvText} from '../public/music-state.js';
const cards=[{id:'a',rank:1,songId:'song1',ru:'дом',en:'home',song:'Song 1',type:'word',usage:'neutral'},{id:'b',rank:2,songId:'song2',ru:'работа',en:'work',song:'Song 2',type:'word',usage:'neutral'}];
const now=Date.now();
test('music reviews filter songs and respect due dates independently of reading progress',()=>{const listening={a:review({},4,now)},reading={};assert.deepEqual(musicQueue(cards,listening,'song1',now),[]);assert.deepEqual(musicQueue(cards,reading,'song1',now),['a']);assert.deepEqual(musicQueue(cards,listening,'song2',now),['b']);});
test('music progress survives JSON reload with FSRS dates',()=>{const record=review({},3,now);const progress=loadMusicProgress(cards,{getItem:()=>JSON.stringify({a:record})});assert.equal(progress.a.card.due.getTime(),record.card.due.getTime());assert.equal(progress.a.history.length,1);});
test('CSV preserves Cyrillic and safely quotes embedded commas and quotes',()=>{const text=csvText([{...cards[0],en:'home, "house"'}]);assert.ok(text.startsWith('\uFEFF'));assert.ok(text.includes('"home, ""house"""'));assert.ok(text.includes('"дом"'));});

test('same word and meaning across songs shares a schedule while retaining each song clip',async()=>{const {mergeMusicCards,forSong}=await import('../public/music-cards.js');const merged=mergeMusicCards([{...cards[0],id:'mdb-01-abc',start:1,end:2},{...cards[0],id:'mdb-02-abc',songId:'song2',song:'Song 2',start:100,end:101},{...cards[0],id:'mdb-02-other',en:'household',start:110,end:111}]);assert.equal(merged.length,2);assert.equal(merged[0].occurrences.length,2);assert.equal(forSong(merged[0],'song2').start,100);const learned={[merged[0].id]:review({},4,now)};assert.ok(!musicQueue(merged,learned,'song2',now).includes(merged[0].id));});
