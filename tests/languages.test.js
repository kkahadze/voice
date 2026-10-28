import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLanguage,languageApi,languageStorageKey} from '../public/languages.js';
test('explicit language links override device preference and Russian keys remain backwards compatible',()=>{
 assert.equal(resolveLanguage('?lang=es','ru'),'es');assert.equal(resolveLanguage('?lang=ru','es'),'ru');assert.equal(resolveLanguage('','es'),'es');assert.equal(resolveLanguage('','invalid'),'ru');
 assert.equal(languageApi('/api/journey','ru'),'/api/journey');assert.equal(languageApi('/api/journey','es'),'/api/journey?language=es');
 assert.equal(languageStorageKey('voice-finalization','ru'),'voice-finalization');assert.notEqual(languageStorageKey('voice-finalization','es'),languageStorageKey('voice-finalization','ru'));
});
