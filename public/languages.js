export const supportedLanguages=['ru','es'];
export const languageNames={ru:'Russian',es:'Spanish'};
export function resolveLanguage(search='',saved=null){
 const explicit=new URLSearchParams(search).get('lang');
 return supportedLanguages.includes(explicit)?explicit:supportedLanguages.includes(saved)?saved:'ru';
}
let preference=null;
try{if(typeof window!=='undefined')preference=window.localStorage?.getItem('voice-language');}catch{}
export const activeLanguage=resolveLanguage(typeof window!=='undefined'?window.location?.search||'':'',preference);
export const languageName=languageNames[activeLanguage];
export const languageApi=(path,language=activeLanguage)=>language==='ru'?path:path+(path.includes('?')?'&':'?')+'language='+encodeURIComponent(language);
export const languageStorageKey=(key,language=activeLanguage)=>language==='ru'?key:key+':'+language;
