import {findRoute,createJourney,request} from '../personal/client.js';
import {cityRouteSource} from '../personal/city-source.js';
import {routeStore} from '../personal/storage.js';
import {saveWorld,restoreWorld} from '../personal/saved-world.js';
import {openSatelliteOverlay} from '../map-review/satellite-overlay.js';
import {openGoogleOverlay} from '../map-review/google-overlay.js';
import example from '../../tests/fixtures/world/water-street-route.json' with {type:'json'};

// The inspector owns the draft. Satellite review and My routes receive the same
// native track; neither re-routes nor rebuilds the reviewed scene.
export function mountMapWorkflow({getDataset,onPins,onDraft,focus}){
  const $=id=>document.getElementById(id),host=$('mapWorkflow');
  host.innerHTML=`<h2>Create → review → drive</h2><p>1. Choose start and finish. 2. Generate the map. 3. Compare with satellite. 4. Save it to My routes.</p>
<form id="worldSearch"><label>Find a place<input id="worldQuery" type="search" placeholder="Cambridge, road or postcode" required></label><button>Search</button></form><div id="worldPlaces"></div>
<button id="worldExample">Cambridge example · Water Street</button>
<div class="world-pins"><button id="worldStart" aria-pressed="false">Place start A</button><button id="worldEnd" aria-pressed="false">Place finish B</button></div><p id="worldPins">Click Place start, then a road on the map.</p>
<label>Map name<input id="worldName" value="My reviewed map" maxlength="120"></label><button id="worldGenerate" disabled>1 · Generate map</button><button id="worldCancel" hidden>Cancel generation</button>
<p id="worldFlowStatus" role="status">No map generated yet.</p><button id="worldSatellite" disabled>2 · Compare generated map with satellite</button>
<button id="worldGoogle" disabled>Google satellite (configured API key)</button>
<fieldset id="worldReview" disabled><legend>Satellite review record</legend><p id="worldReference">Satellite not loaded. Source checks alone do not verify accuracy.</p>
${['roads','junctions','markings','parking','buildings'].map(k=>`<label>${k[0].toUpperCase()+k.slice(1)}<select data-review="${k}"><option value="unknown">Unknown / not visible</option><option value="aligned">Visually aligned</option><option value="mismatch">Mismatch found</option></select></label>`).join('')}
<label>Review notes<textarea id="worldNotes" maxlength="3000" placeholder="Areas compared, visible differences and details still unknown"></textarea></label><label><input id="worldReviewed" type="checkbox"> I compared the generated route area with the satellite reference.</label></fieldset>
<button id="worldSave" disabled>3 · Save exact map to My routes</button><p id="worldSaved"></p><a id="worldDrive" hidden>4 · Open My routes &amp; test drive →</a><p>Saved locally in this browser, on this website. Unknown details remain unknown. Visual review is not a survey or an automatic correction.</p>`;
  let searchController=null,pins=[null,null],choice=null,recipe=null,track=null,journey=null,sequence=0,controller=null,reference=null,overlay=null,busy=false;
  const say=text=>$('worldFlowStatus').textContent=text;
  function reset(){sequence++;searchController?.abort();controller?.abort();journey?.cancel();overlay?.close();overlay=null;journey=null;recipe=null;track=null;reference=null;busy=false;$('worldReview').disabled=true;$('worldReviewed').checked=false;$('worldNotes').value='';host.querySelectorAll('[data-review]').forEach(x=>x.value='unknown');$('worldReference').textContent='Satellite not loaded. Source checks alone do not verify accuracy.';$('worldGoogle').disabled=$('worldSatellite').disabled=$('worldSave').disabled=true;$('worldDrive').hidden=true;$('worldSaved').textContent='';$('worldCancel').hidden=true;onDraft(null);refresh();}
  function refresh(){onPins(pins);$('worldGenerate').disabled=busy||!pins.every(Boolean);$('worldExample').disabled=busy;$('worldPins').textContent=pins.map((p,i)=>(i?'B · ':'A · ')+(p?`${p[1].toFixed(5)}, ${p[0].toFixed(5)}`:'not selected')).join(' → ');['worldStart','worldEnd'].forEach((id,i)=>$(id).setAttribute('aria-pressed',String(choice===i)));}
  function choose(i){choice=i;refresh();say(`Click a road to place ${i?'finish B':'start A'}.`);}
  $('worldStart').onclick=()=>choose(0);$('worldEnd').onclick=()=>choose(1);
  async function generate(fixed=null){
    reset();const current=getDataset();if(!current?.index){say('Open a dataset first.');return;}const token=sequence;controller=new AbortController();busy=true;refresh();$('worldCancel').hidden=false;say('Finding route…');
    const progress=text=>{if(token===sequence)say(text);};
    try{
      const route=fixed?structuredClone(fixed):await findRoute(...pins,{signal:controller.signal,onStatus:progress});if(token!==sequence)return;
      route.title=$('worldName').value.trim()||'My reviewed map';
      journey=createJourney(route,{onStatus:progress,citySource:async(r,o)=>{const source=await cityRouteSource(r,{...o,url:current.url});if(!source)throw Error('This route is outside the selected dataset. Open a dataset covering both pins and the full route.');return source;}});
      const world=await journey.prepare();if(token!==sequence)return;
      world.title=route.title;recipe=route;track=world;onDraft(world);$('worldGoogle').disabled=$('worldSatellite').disabled=$('worldSave').disabled=false;
      say(`Map generated · ${Math.round(route.distance)} m · ${world.objects.length} objects. Native route checks passed. Satellite review pending.`);
    }catch(e){if(token===sequence&&e.name!=='AbortError')say(e.message);}finally{if(token===sequence){busy=false;$('worldCancel').hidden=true;refresh();}}
  }
  $('worldGenerate').onclick=()=>generate();$('worldCancel').onclick=()=>{reset();say('Cancelled. Earlier saved maps are kept.');};
  $('worldExample').onclick=()=>{pins=[example.start,example.end];$('worldName').value='Cambridge · Water Street';focus(example.start);generate(example);};
  $('worldSatellite').onclick=()=>{if(!track)return;const token=sequence;overlay=openSatelliteOverlay(track,{onReferenceLoaded:details=>{if(token!==sequence)return;reference=details;$('worldReview').disabled=!details;if(!details)$('worldReviewed').checked=false;$('worldReference').textContent=details?'Satellite loaded for this generated map. Inspect the full route, then record each category and your notes.':'Satellite reference incomplete. Review remains pending.';},onClose:()=>{overlay=null;}});};
  $('worldGoogle').onclick=()=>{if(track)overlay=openGoogleOverlay(track,{onReferenceLoaded:details=>{reference=details;$('worldReview').disabled=!details;if(!details)$('worldReviewed').checked=false;$('worldReference').textContent=details?'Google satellite loaded. Record your visual comparison below.':'Google satellite unavailable. Review pending.';},onClose:()=>{overlay=null;}});};
  $('worldSave').onclick=async()=>{
    if(!track||!recipe)return;const token=sequence;$('worldSave').disabled=true;
    try{
      const title=$('worldName').value.trim();if(!title)throw Error('Give the map a name.');
      const checked=$('worldReviewed').checked,checks=Object.fromEntries([...host.querySelectorAll('[data-review]')].map(x=>[x.dataset.review,x.value])),notes=$('worldNotes').value.trim();
      if(checked&&(!reference||!notes))throw Error('Load satellite and add review notes before recording a completed comparison.');
      const status=checked?(Object.values(checks).includes('mismatch')?'needs-correction':'visual-review'):'pending';
      const review={status,checks,notes,reference:checked?reference:null,reviewedAt:checked?Date.now():null,automaticCorrection:false,datasetVersion:track.osm?.datasetVersion||getDataset()?.index.version};
      const saved=await saveWorld({...recipe,title},{...track,title},review,{store:routeStore()});if(token!==sequence)return;
      $('worldSaved').textContent=`Saved immutable revision ${saved.id.slice(0,8)} · ${status==='pending'?'satellite review pending':status==='needs-correction'?'mismatches recorded':'visual review recorded (unknowns retained)'}.`;
      $('worldDrive').href='index.html?routes&route='+encodeURIComponent(saved.id);$('worldDrive').hidden=false;say('Saved the exact generated map. Open My routes to drive it without regenerating.');
    }catch(e){if(token===sequence)say(e.message);}finally{if(token===sequence)$('worldSave').disabled=!track;}
  };
  $('worldSearch').onsubmit=async e=>{
    e.preventDefault();searchController?.abort();searchController=new AbortController();const active=searchController;const q=$('worldQuery').value.trim();if(!q)return;say('Searching…');$('worldPlaces').replaceChildren();
    try{const results=await request('search?q='+encodeURIComponent(q),{signal:active.signal});if(active!==searchController)return;if(!Array.isArray(results))throw Error('Invalid place search response.');
      for(const item of results.slice(0,6)){const p=[Number(item.lon),Number(item.lat)];if(!p.every(Number.isFinite))continue;const b=document.createElement('button');b.textContent=item.display_name;b.onclick=()=>{focus(p);$('worldPlaces').replaceChildren();say('Place start and finish on roads in this area.');};$('worldPlaces').append(b);}say(results.length?'Choose a place.':'No places found.');
    }catch(e){if(e.name!=='AbortError')say(e.message);}
  };
  async function loadSaved(id){
    reset();const token=sequence;
    try{const row=routeStore().list().find(r=>r.id===id);if(!row?.savedWorld)throw Error('Saved map not found on this browser and website.');const saved=await restoreWorld(row);if(token!==sequence)return;
      recipe=row;track=saved.track;pins=[row.start,row.end];$('worldName').value=row.title;onDraft(track);focus(row.start);refresh();
      $('worldGoogle').disabled=$('worldSatellite').disabled=$('worldSave').disabled=false;
      $('worldNotes').value=saved.review.notes||'';for(const input of host.querySelectorAll('[data-review]'))input.value=saved.review.checks?.[input.dataset.review]||'unknown';
      say('Exact saved map restored · previous review: '+saved.review.status+'. Compare satellite again to record a new review; saving creates another revision.');
    }catch(e){if(token===sequence)say(e.message);}
  }
  return {loadSaved,pick(p){if(choice===null)return false;reset();pins[choice]=p;choice=choice===0?1:null;refresh();say(choice===1?'Now place finish B.':'Ready to generate.');return true;},resetDataset(){reset();pins=[null,null];choice=null;refresh();say('Choose pins or try the Cambridge example.');},pins:()=>pins};
}
