import {createTileControls} from '../tile-builder/controls.js';
import * as L from '../vendor/leaflet.js';
import {request,findRoute,createJourney} from './client.js';
import {decode,metres,eligibleForMock} from './geometry.js';
import {routeStore} from './storage.js';
const distance=m=>m>=1609?`${(m/1609.344).toFixed(1)} miles · ${(m/1000).toFixed(1)} km`:`${Math.round(m)} metres`;
export function createRoutesUI({onDrive,onClose,canDrive,requestLogin}) {
  const sheet=document.createElement('div');sheet.className='sheet personal-routes';sheet.id='personalRoutesSheet';sheet.hidden=true;
  sheet.innerHTML=`<div class="card" role="dialog" aria-modal="true" aria-labelledby="personalRoutesHeading">
    <header><div><span class="route-eyebrow">YOUR PLACES. YOUR PRACTICE.</span><h2 id="personalRoutesHeading">My routes <small>Experimental</small></h2></div><button class="x" type="button" aria-label="Close my routes">×</button></header>
    <div class="personal-layout"><div class="personal-tools">
      <div class="route-pin-controls route-mode"><button class="cbtn" id="routeMode" aria-pressed="true">Route</button><button class="cbtn" id="tileMode" aria-pressed="false">1 km tile</button></div>
      <ol class="route-steps"><li>Find a place</li><li>Pick two pins</li><li>Drive</li></ol>
      <form id="placeSearch"><label for="routePlace">Search for a place</label><div class="route-search"><input id="routePlace" type="search" placeholder="Cambridge, UK" maxlength="200" autocomplete="off" required><button class="cbtn" type="submit">Search</button></div></form>
      <div id="placeResults" aria-label="Place search results"></div>
      <div class="route-pin-controls"><button class="cbtn" id="chooseStart" aria-pressed="true"><b>A</b> Set start</button><button class="cbtn" id="chooseEnd" aria-pressed="false"><b>B</b> Set finish</button><button class="cbtn" id="swapPins" aria-label="Swap start and finish" disabled>⇄</button></div>
      <p id="pinSummary" class="muted">Find your area, then click the map to place A and B. Drag either pin to adjust.</p>
      <button class="cbtn centre-pin" id="pinAtCentre">Set start at map centre</button>
      <button class="cbtn go generate-route" id="generatePersonalRoute" disabled>Generate route</button>
      <p id="personalRouteStatus" role="status" aria-live="polite"></p><button class="cbtn" id="cancelRouteRequest" hidden>Cancel</button>
      <div id="routeReady" hidden><p id="routeDistance"></p><label for="personalRouteName">Route name</label><input id="personalRouteName" maxlength="120" type="text"><p class="muted" id="routeSnap"></p><div class="route-actions"><button class="cbtn" id="savePersonalRoute">Save route</button><button class="cbtn go" id="drivePersonalRoute">Save &amp; drive</button><button class="cbtn go" id="mockPersonalRoute" hidden>Start graded mock test</button></div></div>
      <p class="route-note">Generated roads may differ from real life. Routes over 6 miles can also be driven as a graded mock test: 15 or fewer driving faults and no serious faults to pass. Mock results stay on this device.</p>
    </div><div class="personal-map-column"><div id="personalRouteMap" role="region" aria-label="Choose start and finish on the map"></div><p id="mapTileStatus" role="status" hidden>Map tiles could not load. Check your connection; your pins and route are kept.</p></div></div>
    <section class="personal-library"><div class="route-library-title"><h3>Saved on this device</h3><p>Routes stay in this browser. Clearing site data removes them. No account sync yet.</p></div><div id="personalSavedRoutes"></div></section>
    <footer class="route-credits">Map data and tiles © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener">ODbL</a> · Routing <a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a>. Searches and pins are sent to map providers to generate your route.</footer>
  </div>`;
  document.body.append(sheet);const $=id=>sheet.querySelector('#'+id),status=$('personalRouteStatus'),store=routeStore();
  const map=L.map($('personalRouteMap'),{zoomControl:true}).setView([52.2053,.1218],13);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  tiles.on('tileerror',()=>{$('mapTileStatus').hidden=false;});tiles.on('tileload',()=>{$('mapTileStatus').hidden=true;});
  let choice=0,pins=[null,null],markers=[null,null],line=null,draft=null,controller=null,sequence=0,journey=null,place='My route',busy=false;
  const say=text=>{status.textContent=text;};
  function setBusy(value){busy=value;$('generatePersonalRoute').disabled=value||!pins.every(Boolean);$('cancelRouteRequest').hidden=!value;for(const id of ['savePersonalRoute','drivePersonalRoute','mockPersonalRoute'])$(id).disabled=value;}
  function cancel(){sequence++;controller?.abort();controller=null;journey?.cancel();journey=null;setBusy(false);}
  function invalidate(){cancel();draft=null;$('routeReady').hidden=true;if(line){line.remove();line=null;}say('');}
  function select(which){choice=which;$('chooseStart').setAttribute('aria-pressed',String(which===0));$('chooseEnd').setAttribute('aria-pressed',String(which===1));$('pinAtCentre').textContent=`Set ${which?'finish':'start'} at map centre`;}
  function refreshPins(){
    pins.forEach((p,i)=>{markers[i]?.remove();markers[i]=null;if(!p)return;markers[i]=L.marker([p[1],p[0]],{draggable:true,keyboard:true,title:i?'Finish pin B':'Start pin A',icon:L.divIcon({className:'personal-pin '+(i?'finish':'start'),html:i?'B':'A',iconSize:[32,40],iconAnchor:[16,39]})}).addTo(map);markers[i].on('dragend',()=>{const ll=markers[i].getLatLng();setPin(i,[ll.lng,ll.lat]);});});
    $('swapPins').disabled=!pins.every(Boolean);$('generatePersonalRoute').disabled=busy||!pins.every(Boolean);
    $('pinSummary').textContent=pins.map((p,i)=>(i?'B · Finish: ':'A · Start: ')+(p?`${p[1].toFixed(5)}, ${p[0].toFixed(5)}`:'click the map')).join(' → ');
  }
  function setPin(i,p){invalidate();pins[i]=p;refreshPins();if(i===0&&!pins[1])select(1);}
  map.on('click',e=>{if(!tileControls.active)setPin(choice,[e.latlng.lng,e.latlng.lat]);});
  const tileControls=createTileControls({sheet,map,L,say,onMode:enabled=>{
    invalidate();pins=[null,null];refreshPins();
    for(const el of [sheet.querySelector('.route-steps'),sheet.querySelector('.route-pin-controls:not(.route-mode)'),$('pinSummary'),$('pinAtCentre'),$('generatePersonalRoute'),sheet.querySelector('.personal-tools>.route-note'),sheet.querySelector('.personal-library')])el.hidden=enabled;
    $('routeMode').setAttribute('aria-pressed',String(!enabled));$('tileMode').setAttribute('aria-pressed',String(enabled));
  }});
  $('routeMode').onclick=()=>tileControls.enable(false);$('tileMode').onclick=()=>tileControls.enable(true);
  $('chooseStart').onclick=()=>select(0);$('chooseEnd').onclick=()=>select(1);
  $('pinAtCentre').onclick=()=>{const p=map.getCenter();setPin(choice,[p.lng,p.lat]);};
  $('swapPins').onclick=()=>{invalidate();pins.reverse();refreshPins();};
  function drawRecipe(recipe){
    draft=recipe;line?.remove();line=L.polyline(decode(recipe.geometry).map(([lon,lat])=>[lat,lon]),{color:'#ef4f97',weight:5,opacity:.9}).addTo(map);map.fitBounds(line.getBounds(),{padding:[32,32],maxZoom:16});
    $('routeDistance').textContent=distance(recipe.distance)+(eligibleForMock(recipe)?' · Mock test available':' · Practice drive');$('mockPersonalRoute').hidden=!eligibleForMock(recipe);$('personalRouteName').value=recipe.title;$('routeReady').hidden=false;
    const snaps=[recipe.snappedStart,recipe.snappedEnd];$('routeSnap').textContent=snaps.every(Boolean)?`Pins snap to nearby driving lanes (start ${Math.round(metres(recipe.start,snaps[0]))} m, finish ${Math.round(metres(recipe.end,snaps[1]))} m).`:'Pins follow nearby driving lanes.';
  }
  $('placeSearch').onsubmit=async e=>{
    e.preventDefault();const q=$('routePlace').value.trim();if(!q)return;cancel();tileControls.cancel();const token=sequence;controller=new AbortController();setBusy(true);say('Searching places…');$('placeResults').replaceChildren();
    try{const results=await request('search?q='+encodeURIComponent(q),{signal:controller.signal,onStatus:say});if(token!==sequence)return;
      if(!Array.isArray(results))throw Error('Place search returned an invalid response.');
      for(const result of results.slice(0,8)){const lat=Number(result.lat),lon=Number(result.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;const button=document.createElement('button');button.className='place-result';button.type='button';button.textContent=result.display_name;button.onclick=()=>{invalidate();pins=[null,null];refreshPins();place=String(result.name||result.display_name||q).split(',')[0];const b=result.boundingbox?.map(Number);if(b?.length===4&&b.every(Number.isFinite))map.fitBounds([[b[0],b[2]],[b[1],b[3]]],{maxZoom:15});else map.setView([lat,lon],14);$('placeResults').replaceChildren();if(tileControls.active){tileControls.select([lon,lat]);tileControls.fit();}else{say('Place start A, then finish B on the map.');select(0);}};$('placeResults').append(button);}
      say($('placeResults').children.length?'Choose a place below.':'No matching places. Try a town, road or postcode.');
    }catch(e){if(e.name!=='AbortError'&&token===sequence)say(e.message);}finally{if(token===sequence)setBusy(false);}
  };
  $('generatePersonalRoute').onclick=async()=>{
    invalidate();const token=sequence;controller=new AbortController();setBusy(true);say('Finding a driving route…');
    try{const recipe=await findRoute(...pins,{signal:controller.signal,onStatus:say});if(token!==sequence)return;recipe.title=(place+' · A to B').slice(0,120);drawRecipe(recipe);say('Route ready. Save & drive builds it with the refined map generator.');}
    catch(e){if(e.name!=='AbortError'&&token===sequence)say(e.message);}finally{if(token===sequence)setBusy(false);}
  };
  function save(){if(!draft)throw Error('Generate a route first.');const title=$('personalRouteName').value.trim();if(!title)throw Error('Give your route a name.');draft={...draft,title};store.save(draft);renderSaved();return draft;}
  $('savePersonalRoute').onclick=()=>{try{save();say('Saved on this device.');}catch(e){say(e.message);}};
  async function drive(recipe,graded=false){
    if(graded&&!eligibleForMock(recipe)){say('A graded mock needs a route longer than 6 miles.');return;}if(!canDrive(graded)){requestLogin();return;}cancel();const token=sequence;setBusy(true);journey=createJourney(recipe,{store,onStatus:text=>{if(token===sequence)say(text);}});
    try{const world=await journey.prepare();if(token!==sequence)return;const selected=journey;await onDrive(selected,world,{graded});if(token!==sequence)return;journey=null;sheet.hidden=true;setBusy(false);}
    catch(e){if(token===sequence&&e.name!=='AbortError')say(e.message);if(token===sequence){journey?.cancel();journey=null;setBusy(false);}}
  }
  $('drivePersonalRoute').onclick=()=>{try{drive(save());}catch(e){say(e.message);}};
  $('mockPersonalRoute').onclick=()=>{try{drive(save(),true);}catch(e){say(e.message);}};
  $('cancelRouteRequest').onclick=()=>{cancel();say('Cancelled. Your saved routes are kept.');};
  function renderSaved(){
    const list=$('personalSavedRoutes');list.replaceChildren();let rows;try{rows=store.list();}catch(e){say(e.message);return;}
    if(!rows.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Your first route starts with a place. Search above to begin.';list.append(empty);}
    for(const recipe of rows){const card=document.createElement('article');card.className='personal-route-card';const info=document.createElement('div'),title=document.createElement('b'),detail=document.createElement('span');title.textContent=recipe.title;detail.textContent=distance(recipe.distance);info.append(title,detail);card.append(info);
      const button=(text,fn)=>{const b=document.createElement('button');b.className='cbtn';b.textContent=text;b.onclick=fn;card.append(b);return b;};
      button('View',()=>{invalidate();pins=[recipe.start,recipe.end];refreshPins();drawRecipe(recipe);say('Saved route loaded.');sheet.querySelector('.card').scrollTo({top:0,behavior:'smooth'});});
      button('Drive',()=>{if(!busy)drive(recipe);});if(eligibleForMock(recipe))button('Mock test',()=>{if(!busy)drive(recipe,true);});
      if(recipe.lastMock){const result=document.createElement('span');result.className='muted';result.textContent=recipe.lastMock.completed?`Last mock: ${recipe.lastMock.pass?'Passed':'Failed'} · ${recipe.lastMock.D} driving / ${recipe.lastMock.S} serious`:'Last mock: incomplete';info.append(result);}
      const del=button('Delete',()=>{if(!confirm(`Delete “${recipe.title}” from this browser?`))return;try{cancel();store.remove(recipe.id);if(draft?.id===recipe.id)invalidate();renderSaved();say('Route deleted from this device.');}catch(e){say(e.message);}});del.setAttribute('aria-label','Delete '+recipe.title);list.append(card);
    }
  }
  function close(){cancel();tileControls.cancel();sheet.hidden=true;onClose?.();}
  sheet.querySelector('.x').onclick=close;sheet.addEventListener('click',e=>{if(e.target===sheet)close();});
  sheet.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){const items=[...sheet.querySelectorAll('button,input,a[href],[tabindex="0"]')].filter(e=>!e.disabled&&e.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  window.addEventListener('storage',e=>{if(e.key?.startsWith('slaydrive.personal-routes'))renderSaved();});
  window.addEventListener('learner-access-change',()=>{if(!canDrive()&&busy){cancel();say('Sign in again to drive your saved route.');}});
  const fit=()=>{map.invalidateSize({pan:false});if(tileControls.active){tileControls.fit();return;}if(line)map.fitBounds(line.getBounds(),{padding:[32,32],maxZoom:16});};
  new ResizeObserver(()=>{if(!sheet.hidden)fit();}).observe($('personalRouteMap'));
  return {open({tile=false}={}){sheet.hidden=false;renderSaved();tileControls.enable(tile);say(draft?'Saved route ready.':'Search for a place, then choose start and finish.');if(tile)say('Cambridge is selected. Search above or move the 1 km square, then generate it.');setTimeout(()=>{fit();$('routePlace').focus();},0);},close,map};
}
