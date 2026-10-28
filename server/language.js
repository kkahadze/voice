// Language is selected explicitly by the app, never inferred from a transcript.
export function requestLanguage(request) {
 const values=new URL(request.url).searchParams.getAll('language');
 if(values.length>1||values.length===1&&!['ru','es'].includes(values[0]))throw Error('Choose Russian or Spanish.');
 return values[0]||'ru';
}
export const languageName=language=>language==='es'?'Spanish':'Russian';
// Preserve every existing Russian record. Spanish receives a separate partition
// for records, revisions and idempotency events belonging to the same account.
export const learningUserId=(userId,language='ru')=>language==='es'?'language:es:'+userId:userId;
