import test from 'node:test';import assert from 'node:assert/strict';import {createVoiceGuidance,VOICE_KEY} from '../js/voice.js';
test('voice prefers a UK voice, replaces stale instructions and mute persists immediately',()=>{
 const spoken=[],values=new Map();let cancelled=0;
 const speech={cancel:()=>cancelled++,getVoices:()=>[{lang:'en-US'},{lang:'en-GB'}],speak:u=>spoken.push(u)},storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const voice=createVoiceGuidance({speech,storage,Utterance:class{constructor(text){this.text=text;}}});
 assert.equal(voice.say('Turn left'),true);assert.equal(spoken[0].lang,'en-GB');voice.say('Turn right');assert.equal(cancelled,2);
 voice.setEnabled(false);assert.equal(cancelled,3);assert.equal(values.get(VOICE_KEY),'off');assert.equal(voice.say('Hidden direction'),false);assert.equal(spoken.length,2);
 assert.equal(createVoiceGuidance({speech,storage,Utterance:class{}}).enabled,false);voice.setEnabled(true);assert.equal(voice.say('Continue'),true);
});
test('an unsupported browser keeps written lessons and navigation usable',()=>{const voice=createVoiceGuidance({speech:null,Utterance:null,storage:null});assert.equal(voice.supported,false);assert.equal(voice.say('Continue'),false);voice.cancel();voice.setEnabled(false);});
