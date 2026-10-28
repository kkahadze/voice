// Media time is the clock, so seeking and playback-rate changes need no adjustment.
export function activeLyricIndex(words,time){
 let lo=0,hi=words.length-1,index=-1;
 while(lo<=hi){const mid=(lo+hi)>>1;if(words[mid].start<=time){index=mid;lo=mid+1;}else hi=mid-1;}
 return index>=0&&time<words[index].end?index:-1;
}

// Untimed words seek to the closest measured word in their source block.
// This fallback never becomes a highlight timestamp.
export function lyricSeekTarget(words,index,fallback){
 const timed=word=>Number.isFinite(word?.start)&&Number.isFinite(word?.end)&&word.end>word.start;
 if(timed(words[index]))return {time:words[index].start,approximate:false};
 if(Number.isFinite(words[index]?.seekStart))return {time:words[index].seekStart,approximate:true};
 for(let distance=1;distance<words.length;distance++){
  for(const neighbor of [index-distance,index+distance]){
   if(timed(words[neighbor]))return {time:words[neighbor].start,approximate:true};
  }
 }
 return {time:fallback,approximate:true};
}
