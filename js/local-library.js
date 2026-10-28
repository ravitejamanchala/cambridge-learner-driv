import {clearRoadside} from './roadside-clearance.js';
import {clearRoadBuildings} from './editor-road-clearance.js';
import {prepareEditorTrack} from './editor-routing.js';
import {browserEntries,saveBrowserTrack} from './browser-track-store.js';
export const localAuthoring = () => ['localhost','127.0.0.1','[::1]'].includes(location.hostname) && window.LEARNER_CONFIG?.LOCAL_AUTHORING === true;
export const browserAuthoring = () => window.LEARNER_CONFIG?.BROWSER_AUTHORING === true;
export const authoringEnabled = () => localAuthoring() || browserAuthoring();
async function entries(){if(browserAuthoring())return browserEntries();const response=await fetch('/__local/tracks');if(!response.ok)throw Error('Local route library unavailable');return response.json();}
async function saveTrack(body){if(browserAuthoring())return saveBrowserTrack(body);const response=await fetch('/__local/tracks',{method:'POST',headers:{'Content-Type':'application/json'},body});const result=await response.json();if(!response.ok)throw Error(result.error||'Save failed');return result;}
export function preferredLocalRoute(){if(!authoringEnabled())return null;try{const saved=sessionStorage.getItem('local-route-saved');return saved?'local:'+saved:sessionStorage.getItem('local-route-selected');}catch{return null;}}
export function notifyLocalRoute(plan){if(!authoringEnabled())return;const id=plan?.kind==='mock'?plan.key.slice(6):null;try{if(id?.startsWith('local:'))sessionStorage.setItem('local-route-selected',id);else sessionStorage.removeItem('local-route-selected');}catch{}window.dispatchEvent(new CustomEvent('editor-route-selected',{detail:id}));}
export async function loadLocalLibrary(index,routes) {
 const tracks=new Map(); if(!authoringEnabled()) return tracks;
 for(const entry of await entries()) {
  const id='local:'+entry.id;
  const clean=clearRoadside(clearRoadBuildings(entry.track)),prepared=prepareEditorTrack(clean);
  // Waypoint cuts exist only for navigation. Drawing that split graph erases paint
  // around every interior anchor and shortens junction approaches. Derive the
  // visual graph from the validated source, never an imported renderNetwork field.
  tracks.set(id,{...clean,renderNetwork:clean.network,network:prepared.network,plan:{...entry.track.plan,waypoints:prepared.waypoints}});
  index.areas.push({id,file:''}); index.plans['route:'+id]={...entry.meta,area:id};
  routes.push({id,practiceMode:entry.track.practiceMode,name:entry.track.title+' · local '+entry.id.slice(0,8),blurb:'Local editor revision '+entry.id+'. '+(entry.track.attribution||''),waypoints:prepared.waypoints,localNodes:prepared.nodes});
 }
 return tracks;
}
export function mountLocalLibrary({onSelect,selectedRoute}={}){
 if(!authoringEnabled()) return;
 const style=document.createElement('style');style.textContent='.local-track-library{margin:14px 0;padding:18px;border:1px solid #a2b7e0;border-radius:14px;background:#eef4ff;color:#263855}.local-track-library p{font-size:13px;line-height:1.5}.local-track-library summary{cursor:pointer;font-weight:600;padding:10px 0}.local-track-library textarea{box-sizing:border-box;min-height:220px;background:white;color:#24324a;border:1px solid #9aaaca;border-radius:8px;padding:10px;margin:10px 0}.local-track-library select{max-width:100%;padding:8px}.local-track-library [role=status]{overflow-wrap:anywhere}';document.head.append(style);
 const panel=document.createElement('div');panel.id='localTrackLibrary';panel.className='local-track-library';
 panel.innerHTML='<h3>Local editor routes</h3><p>Import an exported SlayDrive admin JSON. Each save keeps a new revision on this computer and adds it to Mock tests.</p><input type="file" accept=".json,application/json" aria-label="Import editor track JSON"><p role="status" aria-live="polite"></p>';
 const summary=document.createElement('p');summary.id='localTrackSummary';panel.append(summary);
 const details=document.createElement('details');details.innerHTML='<summary>Edit saved JSON</summary><label>Revision <select aria-label="Saved local revision"></select></label><textarea aria-label="Editor track JSON" rows="10" spellcheck="false" style="width:100%;font-family:monospace"></textarea><button class="cbtn" type="button">Save as new revision</button><button class="cbtn" type="button" data-export>Download JSON</button>';
 panel.append(details);
 const pilot=document.createElement('details');pilot.className='pilot-routes';
 const heading=document.createElement('summary');heading.textContent='Cambridge (Brookmount Court) experimental loops';pilot.append(heading);
 const note=document.createElement('p');note.textContent='Two approximately 6 km loops on cached OSM roads, with buildings included. No grading or saved results. Centre entrance and access/turn restrictions are unverified; buildings are generated scenery. Each load saves a new local revision.';pilot.append(note);
 for(const direction of ['clockwise','anticlockwise']){
  const button=document.createElement('button');button.type='button';button.className='cbtn';button.textContent='Load '+direction+' practice';
  button.onclick=async()=>{button.disabled=true;status.textContent='Loading experimental loop…';try{
   const response=await fetch(new URL('examples/cambridge-pilot/v2-buildings/brookmount-'+direction+'.json',document.baseURI));
   if(!response.ok)throw Error('Pilot file unavailable in this build. Import its JSON instead.');
   await persist(await response.text());
  }catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
  pilot.append(button);
 }
 panel.append(pilot);

 const status=panel.querySelector('[role=status]'),input=panel.querySelector('input'),select=details.querySelector('select'),textarea=details.querySelector('textarea'),save=details.querySelector('button');
 const downloadButton=details.querySelector('[data-export]');
 let currentId=null,library=[],loaded=false,chosen=selectedRoute?.()||null;
 function show(id){
  chosen=id;if(!loaded)return;
  const entry=library.find(e=>'local:'+e.id===id);
  currentId=entry?.id||null;select.value=currentId||'';textarea.value=entry?JSON.stringify(entry.track,null,2):'';
  textarea.disabled=save.disabled=downloadButton.disabled=!entry;
  if(entry){const track=entry.track,clean=clearRoadside(clearRoadBuildings(track)),first=track.plan.waypoints[0],last=track.plan.waypoints.at(-1);summary.textContent=track.title+' · revision '+entry.id.slice(0,8)+' · '+track.network.edges.length+' road segments · '+clean.objects.filter(o=>o.type==='building').length+' buildings'+(clean.buildingClearance.excluded.length?' · '+clean.buildingClearance.excluded.length+' road overlaps excluded':'')+' · start '+first.x.toFixed(1)+', '+first.z.toFixed(1)+' → finish '+last.x.toFixed(1)+', '+last.z.toFixed(1)+' · spawn '+track.spawn.x.toFixed(1)+', '+track.spawn.z.toFixed(1);}
  else summary.textContent='Select an imported route to edit or download its JSON. Built-in mock tests use their own maps.';
 }
 textarea.disabled=save.disabled=downloadButton.disabled=true;
 window.addEventListener('editor-route-selected',event=>show(event.detail));
 entries().then(saved=>{library=saved;const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose an imported route…';placeholder.disabled=true;select.append(placeholder);for(const entry of library){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.track.title+' · '+entry.id.slice(0,8);select.append(option);}loaded=true;select.onchange=()=>{if(!select.value)return;show('local:'+select.value);onSelect?.('local:'+select.value);};show(chosen);if(!library.length)details.hidden=true;}).catch(e=>{status.textContent=e.message;});

 async function persist(body){
  input.disabled=save.disabled=true;status.textContent='Validating and saving…';try{
   if(new Blob([body]).size>8*1024*1024)throw Error('JSON must be smaller than 8 MB');
   const result=await saveTrack(body);
   sessionStorage.setItem('local-route-saved',result.id);location.reload();
  }catch(error){status.textContent=error.message;input.disabled=save.disabled=false;}
 }
 input.onchange=async()=>{const file=input.files[0];if(!file)return;if(file.size>8*1024*1024){status.textContent='JSON must be smaller than 8 MB';return;}await persist(await file.text());};
 save.onclick=()=>persist(textarea.value);
 details.querySelector('[data-export]').onclick=()=>{try{JSON.parse(textarea.value);const url=URL.createObjectURL(new Blob([textarea.value],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=(JSON.parse(textarea.value).title.replace(/[^a-z0-9_-]/gi,'_')||'mock-track')+'-'+(currentId?.slice(0,8)||'draft')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{status.textContent='Fix invalid JSON before downloading';}};
 if(browserAuthoring()){panel.querySelector('h3').textContent='Browser JSON route library';panel.querySelector('p').textContent='GitHub Pages preview. Import an admin JSON, edit it and drive it in Mock tests. Saves stay in this browser on this device. Download JSON for backup; clearing site data removes saved revisions.';document.title='SlayDrive · JSON route preview';}
 document.querySelector('#routePick').before(panel);
 const saved=sessionStorage.getItem('local-route-saved');if(saved){sessionStorage.removeItem('local-route-saved');status.textContent=(browserAuthoring()?'Saved in this browser.':'Saved on disk.')+' Imported route selected—press Start mock test.';}
}
