import {request} from '../personal/client.js';
import {tileSelection} from './selection.js';

// A mode inside the existing My routes panel. Shared theme, search and map.
export function createTileControls({sheet,map,L,say,onMode}){
 const $=id=>sheet.querySelector('#'+id),host=document.createElement('div');host.id='tileControls';host.hidden=true;
 host.innerHTML=`<p><b>1 km × 1 km tile</b></p><p class="muted">Search above, then click the map or drag the centre pin. The square is the area to generate.</p><p id="tileCoordinates" class="muted"></p><button class="cbtn centre-pin" id="tileRecenter">Show selected square</button><button class="cbtn go generate-route" id="tileGenerate">Generate 3D tile</button><button class="cbtn" id="tileCancel" hidden>Cancel generation</button><div class="route-actions"><button class="cbtn" id="tileMap">Map</button><button class="cbtn" id="tile3D" disabled>3D tile</button><button class="cbtn" id="tileReset" hidden>Reset view</button></div><p id="tileCounts" class="muted"></p><label><input type="checkbox" id="tileGuides" checked> Road names &amp; direction guide</label><details id="tileCoverage" hidden><summary>Mapped street details</summary><p id="tileAssets"></p><p id="tileUnknown" class="muted"></p></details><p class="route-note">Joined streets with simulator lane lines, junction approaches and mapped street assets. Blue arrows and name labels are guidance. Marking placement, missing widths and heights are estimated; terrain is flat. Signal heads show a static layout, not a live phase.</p>`;
 $('placeResults').after(host);
 const viewport=document.createElement('div');viewport.id='tileViewport';viewport.hidden=true;viewport.setAttribute('aria-label','Generated one kilometre tile');sheet.querySelector('.personal-map-column').append(viewport);
 let active=false,center=[.1218,52.2053],selection=tileSelection(center),tile=null,viewer=null,worker=null,controller=null,epoch=0;
 const bounds=b=>[[b[0],b[1]],[b[2],b[3]]];
 const square=L.rectangle(bounds(selection.bounds),{color:'#c13070',weight:2,fillColor:'#ef4f97',fillOpacity:.12,interactive:false});
 const marker=L.marker([center[1],center[0]],{draggable:true,title:'Tile centre',icon:L.divIcon({className:'personal-pin finish tile-centre-pin',html:'•',iconSize:[32,40],iconAnchor:[16,39]})});
 function busy(value){$('tileGenerate').disabled=value;$('tileCancel').hidden=!value;$('tileGenerate').textContent=value?'Generating tile…':'Generate 3D tile';}
 function cancel(){epoch++;controller?.abort();controller=null;worker?.terminate();worker=null;busy(false);}
 function showMap(){viewport.hidden=true;$('personalRouteMap').hidden=false;$('tileReset').hidden=true;$('tileMap').setAttribute('aria-pressed','true');$('tile3D').setAttribute('aria-pressed','false');map.invalidateSize({pan:false});}
 function fit(){if(!active||!viewport.hidden)return;map.invalidateSize({pan:false});map.fitBounds(square.getBounds(),{padding:[32,32],animate:false});}
 function select(point){
  let next;try{next=tileSelection(point);}catch{say('Choose a square away from the poles or date line.');return;}
  cancel();center=[...point];selection=next;tile=null;viewer?.clear();$('tile3D').disabled=true;$('tileCounts').textContent='';$('tileCoverage').hidden=true;showMap();marker.setLatLng([center[1],center[0]]);square.setBounds(bounds(selection.bounds));$('tileCoordinates').textContent=`Centre: ${center[1].toFixed(5)}, ${center[0].toFixed(5)} · 1,000 × 1,000 m`;say('Square selected. Generate this tile when you’re ready.');
 }
 marker.on('dragend',()=>{const p=marker.getLatLng();select([p.lng,p.lat]);});
 map.on('click',e=>{if(active)select([e.latlng.lng,e.latlng.lat]);});
 function enable(value){if(value===active){if(value)fit();return;}cancel();active=value;host.hidden=!value;onMode(value);if(value){const p=map.getCenter();square.addTo(map);marker.addTo(map);select([p.lng,p.lat]);fit();}else{showMap();square.remove();marker.remove();}}
 function show3D(){if(!tile||!viewer)return;$('personalRouteMap').hidden=true;$('mapTileStatus').hidden=true;viewport.hidden=false;$('tileReset').hidden=false;$('tileMap').setAttribute('aria-pressed','false');$('tile3D').setAttribute('aria-pressed','true');viewer.render();}
 function build(osm,point,signal){return new Promise((resolve,reject)=>{
  const generator=new Worker(new URL(document.querySelector('meta[name=app-release]')?'tile-worker.js':'js/tile-builder/worker.js',document.baseURI),{type:'module'});worker=generator;
  const cleanup=()=>{generator.terminate();if(worker===generator)worker=null;signal.removeEventListener('abort',abort);};const abort=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};
  if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});generator.onmessage=({data})=>{cleanup();data.error?reject(Error(data.error)):resolve(data.tile);};generator.onerror=()=>{cleanup();reject(Error('The tile could not be generated. Please retry.'));};generator.postMessage({osm,center:point});
 });}
 $('tileGenerate').onclick=async()=>{
  cancel();const token=epoch,point=[...center],chosen=selection;controller=new AbortController();const signal=controller.signal;busy(true);say('Downloading the square and its 100 m data buffer…');
  try{const osm=await request('osm',{body:{bounds:chosen.dataBounds},signal,onStatus:text=>{if(token===epoch)say(text);}});if(token!==epoch)return;say('Loading mapped road markings and parking bays…');let detailWarning='';try{const details=await request('tile-details',{body:{bounds:chosen.dataBounds},signal,onStatus:say});const elements=new Map(osm.elements.map(e=>[e.type+':'+e.id,e]));for(const e of details.elements){const key=e.type+':'+e.id;if(!elements.has(key))elements.set(key,e);}osm.elements=[...elements.values()];}catch(e){if(signal.aborted)throw e;detailWarning='Additional markings unavailable: '+e.message;}if(token!==epoch)return;say('Joining roads and building your 3D tile…');const result=await build(osm,point,signal);if(detailWarning)result.street.unknown.push(detailWarning);if(token!==epoch)return;
   if(!viewer){const {createViewer}=await import('./viewer.js');if(token!==epoch)return;try{viewer=createViewer(viewport);}catch{throw Error('3D graphics are unavailable. Enable browser hardware acceleration and retry.');}}
   viewer.show(result);tile=result;$('tile3D').disabled=false;show3D();$('tileCounts').textContent=`${tile.stats.buildings} buildings · ${tile.stats.roadPolygons} road surfaces · ${tile.stats.estimatedHeights} estimated building heights${tile.source.timestamp?' · OSM '+tile.source.timestamp.slice(0,10):''}`;$('tileCoverage').hidden=false;$('tileAssets').textContent=Object.entries({...tile.street.counts,laneArrows:tile.street.arrows.length,roadText:tile.street.texts.length,yellowBoxes:tile.street.boxes.length,parkingBays:tile.street.parking.length,vehicleSignals:tile.street.signals.filter(s=>s.role==='vehicle').length,pedestrianSignals:tile.street.signals.filter(s=>s.role==='pedestrian').length,signs:tile.street.signs.length,restrictions:tile.street.restrictions.length,pedestrianCrossings:tile.street.crossings.length,estimatedLineDashes:tile.street.inferredPaint,estimatedArrows:tile.street.inferredArrows}).map(([k,v])=>`${k}: ${v}`).join(' · ');$('tileUnknown').textContent=`${tile.street.excluded.length} roadside objects omitted because their base overlaps a road. ${tile.street.unknown.join('; ')} Standard lane lines and approach guidance use simulator estimates; exact yellow boxes and parking bays require mapped boundaries. Restrictions are reference labels in this preview, not a driving test.`;say('Tile ready. Drag to orbit, right-drag to pan, scroll to zoom.');
  }catch(e){if(token===epoch&&e.name!=='AbortError')say(e.message);}finally{if(token===epoch)busy(false);}
 };
 $('tileGuides').onchange=()=>viewer?.setGuides($('tileGuides').checked);
 $('tileCancel').onclick=()=>{cancel();say('Cancelled. Move the square or try again.');};$('tileRecenter').onclick=()=>{showMap();fit();};$('tileMap').onclick=()=>{showMap();fit();};$('tile3D').onclick=show3D;$('tileReset').onclick=()=>viewer?.reset();
 return {get active(){return active;},enable,select,fit,cancel};
}
