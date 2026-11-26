import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFile,sha256,MAX_SIZE} from '../src/domain.js';
test('accept documented text/audio formats and uppercase extensions',()=>{for(const name of ['work.TXT','書稿.pdf','客語.wav','story.docx','talk.m4a'])assert.ok(validateFile({name,size:123}));});
test('reject empty, oversized, executable and misleading double extensions',()=>{for(const f of [{name:'x.txt',size:0},{name:'x.wav',size:MAX_SIZE+1},{name:'x.txt.exe',size:20},{name:'x.html',size:20}])assert.throws(()=>validateFile(f));assert.equal(validateFile({name:'x.wav',size:MAX_SIZE}),'wav');});
test('SHA-256 matches known vector for evidence manifests',async()=>{assert.equal(await sha256(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');});
