import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {activeLyricIndex,lyricSeekTarget} from '../public/lyric-sync.js';
test('lyric highlight follows media time through gaps, backward seeks, and word boundaries',()=>{const words=[{start:1,end:1.5},{start:1.5,end:2},{start:4,end:5}];assert.equal(activeLyricIndex(words,0),-1);assert.equal(activeLyricIndex(words,1),0);assert.equal(activeLyricIndex(words,1.5),1);assert.equal(activeLyricIndex(words,3),-1);assert.equal(activeLyricIndex(words,4.5),2);assert.equal(activeLyricIndex(words,1.2),0);assert.equal(activeLyricIndex(words,5),-1);assert.equal(activeLyricIndex([],5),-1);});
test('word alignment preserves transcript text and keeps valid timings within their source block',()=>{const data=JSON.parse(fs.readFileSync(new URL('../public/music/transcripts.json',import.meta.url)));let timed=0,untimed=0;for(const song of data.songs)for(const line of song.lines){assert.equal(line.words.map(w=>w.text).join(' '),line.text.replace(/\s+/g,' ').trim());let previous=line.start;for(const w of line.words){if(w.start===undefined){untimed++;assert.equal(w.end,undefined);continue;}assert.ok(w.start>=previous&&w.start>=line.start&&w.end<=line.end&&w.end>w.start);previous=w.start;timed++;}}assert.ok(timed>0&&untimed>0);});
test('every displayed lyric token has a short meaning or an explicit uncertainty marker',()=>{const data=JSON.parse(fs.readFileSync(new URL('../public/music/transcripts.json',import.meta.url)));for(const song of data.songs)for(const line of song.lines)for(const word of line.words){assert.equal(typeof word.meaning,'string');assert.ok(word.meaning.trim());assert.equal(typeof word.meaningUncertain,'boolean');if(word.meaningUncertain)assert.equal(word.meaning,'unclear');assert.ok(word.meaning.length<120);}});

test('word seeking uses exact timings and the nearest measured neighbor for untimed words',()=>{
 const words=[{text:'a'},{start:2,end:3},{},{},{},{start:8,end:9},{}];
 assert.deepEqual(lyricSeekTarget(words,1,0),{time:2,approximate:false});
 assert.deepEqual(lyricSeekTarget(words,0,0),{time:2,approximate:true});
 assert.deepEqual(lyricSeekTarget(words,2,0),{time:2,approximate:true});
 assert.deepEqual(lyricSeekTarget(words,3,0),{time:2,approximate:true});
 assert.deepEqual(lyricSeekTarget(words,4,0),{time:8,approximate:true});
 assert.deepEqual(lyricSeekTarget(words,6,0),{time:8,approximate:true});
 assert.deepEqual(lyricSeekTarget([{},{start:7,end:7},{}],1,5),{time:5,approximate:true});
 assert.deepEqual(lyricSeekTarget([{seekStart:5},{start:8,end:9}],0,0),{time:5,approximate:true});
 assert.equal(words[0].start,undefined);
});
test('every song has refined album-clock timing and unresolved words never receive invented highlight ranges',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../public/music/transcripts.json',import.meta.url)));
 const album=JSON.parse(fs.readFileSync(new URL('../public/music/album.json',import.meta.url)));
 for(const song of data.songs){
  const track=album.songs.find(t=>t.id===song.id);assert.ok(track);assert.equal(song.alignment.refined,true);
  let aligned=0,unresolved=0;
  for(const line of song.lines)for(const word of line.words){
   if(word.timingStatus==='aligned'){
    aligned++;assert.ok(word.start>=track.start&&word.end<=track.end);
    assert.ok(word.end>word.start&&word.end-word.start<=(word.meaning==='ad-lib'?6:3));
   }else{
    if(word.timingStatus==='unresolved')unresolved++;
    assert.equal(word.start,undefined);assert.equal(word.end,undefined);
    assert.ok(word.seekStart>=track.start&&word.seekStart<=track.end);
   }
  }
  assert.equal(aligned,song.alignment.alignedWords);assert.equal(unresolved,song.alignment.unresolvedWords);
 }
});
