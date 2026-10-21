import {browserEntries,saveBrowserTrack} from './browser-track-store.js';
export const localAuthoring = () => ['localhost','127.0.0.1','[::1]'].includes(location.hostname) && window.LEARNER_CONFIG?.LOCAL_AUTHORING === true;
export const browserAuthoring = () => window.LEARNER_CONFIG?.BROWSER_AUTHORING === true;
export const authoringEnabled = () => localAuthoring() || browserAuthoring();
async function entries(){if(browserAuthoring())return browserEntries();const response=await fetch('/__local/tracks');if(!response.ok)throw Error('Local route library unavailable');return response.json();}
async function saveTrack(body){if(browserAuthoring())return saveBrowserTrack(body);const response=await fetch('/__local/tracks',{method:'POST',headers:{'Content-Type':'application/json'},body});const result=await response.json();if(!response.ok)throw Error(result.error||'Save failed');return result;}
export async function loadLocalLibrary(index,routes) {
 const tracks=new Map(); if(!authoringEnabled()) return tracks;
 for(const entry of await entries()) {
  const id='local:'+entry.id;
  tracks.set(id,entry.track);
  index.areas.push({id,file:''}); index.plans['route:'+id]={...entry.meta,area:id};
  routes.push({id,name:entry.track.title+' · local',blurb:'Local editor revision '+entry.id+'. '+(entry.track.attribution||''),waypoints:entry.track.plan.waypoints});
 }
 return tracks;
}
export function mountLocalLibrary(){
 if(!authoringEnabled()) return;
 const style=document.createElement('style');style.textContent='.local-track-library{margin:14px 0;padding:18px;border:1px solid #a2b7e0;border-radius:14px;background:#eef4ff;color:#263855}.local-track-library p{font-size:13px;line-height:1.5}.local-track-library summary{cursor:pointer;font-weight:600;padding:10px 0}.local-track-library textarea{box-sizing:border-box;min-height:220px;background:white;color:#24324a;border:1px solid #9aaaca;border-radius:8px;padding:10px;margin:10px 0}.local-track-library select{max-width:100%;padding:8px}.local-track-library [role=status]{overflow-wrap:anywhere}';document.head.append(style);
 const panel=document.createElement('div');panel.id='localTrackLibrary';panel.className='local-track-library';
 panel.innerHTML='<h3>Local editor routes</h3><p>Import an exported SlayDrive admin JSON. Each save keeps a new revision on this computer and adds it to Mock tests.</p><input type="file" accept=".json,application/json" aria-label="Import editor track JSON"><p role="status" aria-live="polite"></p>';
 const details=document.createElement('details');details.innerHTML='<summary>Edit saved JSON</summary><label>Revision <select aria-label="Saved local revision"></select></label><textarea aria-label="Editor track JSON" rows="10" spellcheck="false" style="width:100%;font-family:monospace"></textarea><button class="cbtn" type="button">Save as new revision</button><button class="cbtn" type="button" data-export>Download JSON</button>';
 panel.append(details);
 const status=panel.querySelector('[role=status]'),input=panel.querySelector('input'),select=details.querySelector('select'),textarea=details.querySelector('textarea'),save=details.querySelector('button');
 entries().then(entries=>{for(const entry of entries){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.track.title+' · '+entry.id.slice(0,8);select.append(option);}select.onchange=()=>{textarea.value=JSON.stringify(entries.find(e=>e.id===select.value)?.track||{},null,2);};if(entries.length)select.onchange();else details.hidden=true;}).catch(e=>{status.textContent=e.message;});
 async function persist(body){
  input.disabled=save.disabled=true;status.textContent='Validating and saving…';try{
   if(new Blob([body]).size>8*1024*1024)throw Error('JSON must be smaller than 8 MB');
   const result=await saveTrack(body);
   sessionStorage.setItem('local-route-saved',result.id);location.reload();
  }catch(error){status.textContent=error.message;input.disabled=save.disabled=false;}
 }
 input.onchange=async()=>{const file=input.files[0];if(!file)return;if(file.size>8*1024*1024){status.textContent='JSON must be smaller than 8 MB';return;}await persist(await file.text());};
 save.onclick=()=>persist(textarea.value);
 details.querySelector('[data-export]').onclick=()=>{try{JSON.parse(textarea.value);const url=URL.createObjectURL(new Blob([textarea.value],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='local-mock-track.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{status.textContent='Fix invalid JSON before downloading';}};
 if(browserAuthoring()){panel.querySelector('h3').textContent='Browser JSON route library';panel.querySelector('p').textContent='GitHub Pages preview. Import an admin JSON, edit it and drive it in Mock tests. Saves stay in this browser on this device. Download JSON for backup; clearing site data removes saved revisions.';document.title='SlayDrive · JSON route preview';}
 document.querySelector('#routePick').before(panel);
 const saved=sessionStorage.getItem('local-route-saved');if(saved){sessionStorage.removeItem('local-route-saved');status.textContent=(browserAuthoring()?'Saved in this browser.':'Saved on disk.')+' Select the new local revision below, then Start mock test.';}
}
