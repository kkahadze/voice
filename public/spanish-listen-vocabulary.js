// Match only attested headwords/phrases. Accents distinguish words such as sí/si.
const normalize=text=>String(text||'').normalize('NFC').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();

export function buildSpanishListeningVocabulary(lessons,deck) {
 const passages=lessons.map(lesson=>({id:lesson.id,title:lesson.topic||lesson.front||lesson.id,text:' '+normalize(lesson.script)+' '}));
 const cards=[],seen=new Set();
 for(const word of deck){
  const lemma=typeof word.es==='string'?word.es.normalize('NFC').trim():'';
  const term=normalize(lemma);
  if(!term||typeof word.en!=='string'||!word.en.trim()||seen.has(term))continue;
  const occurrences=passages.filter(p=>p.text.includes(' '+term+' ')).map(p=>({songId:p.id,song:p.title}));
  if(!occurrences.length)continue;
  seen.add(term);
  cards.push({id:'es-listening-word-'+encodeURIComponent(term),rank:cards.length+1,ru:lemma,es:lemma,en:word.en.trim(),lemma,type:term.includes(' ')?'phrase':'word',usage:'neutral',song:occurrences[0].song,songId:occurrences[0].songId,occurrences});
 }
 return {cards,qualityNote:'Words that occur in these original Spanish passages, matched to your Spanish vocabulary deck. Meanings are general learning glosses and may vary with context.'};
}
