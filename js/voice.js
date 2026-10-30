// Browser-provided voices; no audio service, microphone or API key required.
export const VOICE_KEY='slaydrive.voice.v1';
export function createVoiceGuidance({speech=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,storage}={}){
 let enabled=true;try{if(storage===undefined)storage=globalThis.localStorage;enabled=storage?.getItem(VOICE_KEY)!=='off';}catch{}
 const supported=!!speech&&typeof Utterance==='function';
 const cancel=()=>{try{if(supported)speech.cancel();}catch{}};
 return {supported,get enabled(){return enabled;},cancel,
  setEnabled(on){enabled=!!on;try{storage?.setItem(VOICE_KEY,enabled?'on':'off');}catch{}if(!enabled)cancel();},
  say(text){if(!enabled||!supported)return false;const words=String(text||'').replace(/<[^>]*>/g,'').trim().slice(0,1200);if(!words)return false;
   try{cancel();const utterance=new Utterance(words),voices=speech.getVoices();utterance.voice=voices.find(v=>/^en[-_]GB$/i.test(v.lang))||voices.find(v=>/^en\b/i.test(v.lang))||null;utterance.lang=utterance.voice?.lang||'en-GB';utterance.rate=.95;utterance.volume=.85;
    speech.resume?.();speech.speak(utterance);return true;
   }catch{return false;} // Written directions still work if a device rejects audio.
  }
 };
}
