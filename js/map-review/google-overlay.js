import {visionOverlay} from './vision-proposals.js';
import {overlayGeometry} from './geometry.js';
import {buildNet} from '../net.js';
import {applyMappedRoadTags} from '../mapped-road-tags.js';
let apiPromise=null;
export function loadGoogleMaps(key){
 if(globalThis.google?.maps?.Map)return Promise.resolve(globalThis.google.maps);
 if(!key?.trim())return Promise.reject(Error('A restricted Google Maps JavaScript API browser key is required.'));
 if(apiPromise)return apiPromise;
 apiPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script'),callback='slaydriveGoogleReady';
  const previousFailure=window.gm_authFailure;
  const cleanup=()=>{clearTimeout(timer);delete window[callback];window.gm_authFailure=previousFailure;};
  const fail=()=>{cleanup();script.remove();apiPromise=null;reject(Error('Google Maps could not authenticate or load. Check the API, billing and allowed website referrers.'));};
  const timer=setTimeout(fail,20000);window.gm_authFailure=fail;
  window[callback]=()=>{cleanup();resolve(window.google.maps);};script.onerror=fail;
  script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key.trim())+'&v=quarterly&loading=async&callback='+callback;
  script.async=true;document.head.append(script);
 });return apiPromise;
}
export function openGoogleOverlay(track,{onClose=()=>{},onReferenceLoaded=()=>{}}={}){
 if(document.getElementById('googleReview'))return;
 const net=buildNet(track.renderNetwork||track.network);applyMappedRoadTags(net,track.osm?.ways);
 const data=overlayGeometry(track,net),root=document.createElement('dialog');root.id='googleReview';
 root.innerHTML=`<style>
#googleReview{width:calc(100vw - 32px);max-width:1600px;height:calc(100dvh - 32px);max-height:none;padding:0;border:1px solid #55727a;border-radius:16px;background:#18252a;color:#f3f6f3;font:14px system-ui}#googleReview::backdrop{background:#0009}#googleReview header{display:flex;align-items:center;justify-content:space-between;padding:12px 18px}#googleReview h2{font-size:18px;margin:0}#googleReview .layout{display:grid;grid-template-columns:280px 1fr;height:calc(100% - 55px)}#googleReview aside{padding:14px;overflow:auto;background:#223238}#googleReview label{display:block;margin:12px 0}#googleReview input:not([type=checkbox]){width:100%;max-width:100%}#googleReview input[type=password],#googleReview textarea{padding:9px;border:1px solid #647c84;background:#122026;color:white;border-radius:7px;box-sizing:border-box;width:100%}#googleReview button{border:1px solid #6a888c;border-radius:8px;background:#31494d;color:white;padding:8px 12px;cursor:pointer}#googleReview a{color:#9fd3ff}#googleReview #gmCanvas{min-height:220px;background:#d8dfd6;color:#1c292c}#googleReview pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}#googleReview p{line-height:1.45}#googleReview [hidden]{display:none!important}@media(max-width:650px){#googleReview .layout{grid-template-columns:1fr;grid-template-rows:220px 1fr}#googleReview aside{font-size:12px}#googleReview{width:100vw;height:100dvh;border-radius:0}}
</style><header><h2>Google satellite · our generated map overlay</h2><button id="gmClose" aria-label="Close Google overlay">Close</button></header><div class="layout"><aside>
<p id="gmStatus" role="status">Load Google satellite to compare our existing geometry. No imagery is extracted or saved.</p>
<form id="gmConnect"><label>Restricted browser API key <input id="gmKey" type="password" autocomplete="off" aria-label="Google Maps browser API key"></label><button>Load satellite</button><p>The key is used only for this session. Enable Maps JavaScript API and restrict it to this preview’s website origin.</p></form>
<label>Overlay opacity <input id="gmOpacity" type="range" min="0" max="100" value="35"></label><div id="gmLayers"></div>
<button id="gmFit">Fit generated map</button><button id="gmHide">Hide overlay</button>
<p id="gmCount"></p><p>Drag and zoom the Google map: our geometry stays geographically aligned. Click an overlay feature for its source details.</p><p>Width tags are source evidence, not independent verification. Missing paint remains unknown.</p>
<label>Import licensed-image vision proposals <input id="gmVision" type="file" accept="application/json,.json,.geojson"></label><p>Orange proposals are unverified. Importing them does not change the simulator.</p><pre id="gmDetail">No feature selected.</pre><p id="gmAttribution"></p><a id="gmExternal" target="_blank" rel="noreferrer">Open location in Google Maps</a>
</aside><section id="gmCanvas" aria-label="Google satellite comparison map"></section></div>`;
 document.body.append(root);root.showModal();const $=id=>root.querySelector('#'+id);
 $('gmAttribution').textContent=data.attribution||'Map geometry © OpenStreetMap contributors';
 $('gmExternal').href=`https://www.google.com/maps/@?api=1&map_action=map&center=${data.origin.lat},${data.origin.lng}&zoom=18&basemap=satellite`;
 const colors={roads:'#f04b9b',centreline:'#1dd9e4',paint:'#ffffff',boxes:'#ffd249',parking:'#65db95',buildings:'#b38cff',proposals:'#ff963c'},active=new Set(Object.keys(colors));
 for(const [id,color]of Object.entries(colors)){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.dataset.layer=id;input.onchange=()=>{input.checked?active.add(id):active.delete(id);draw();};label.append(input,' '+id);label.style.color=color;$('gmLayers').append(label);}
 let referenceReported=false,map,maps,shapes=[],closed=false,hidden=false,listener,oldAuthFailure,connecting=false;
 const remove=()=>{for(const s of shapes){maps?.event?.clearInstanceListeners(s);s.setMap(null);}shapes=[];};
 function draw(){if(!map||closed)return;remove();const b=map.getBounds()?.toJSON();const visible=hidden?[]:data.features.filter(f=>active.has(f.layer)&&(!b||(f.bounds.west<=b.east&&f.bounds.east>=b.west&&f.bounds.south<=b.north&&f.bounds.north>=b.south)));const limit=1500,opacity=Number($('gmOpacity').value)/100;
  for(const f of visible.slice(0,limit)){const style={map,strokeColor:colors[f.layer],strokeOpacity:opacity,strokeWeight:f.layer==='paint'?0:1.5,clickable:true,fillColor:colors[f.layer],fillOpacity:opacity*.45,geodesic:false};const shape=f.polygon?new maps.Polygon({...style,paths:f.paths}):new maps.Polyline({...style,path:f.paths[0]});shape.addListener('click',()=>{$('gmDetail').textContent=f.id+'\n'+f.detail;});shapes.push(shape);}
  $('gmCount').textContent=`${Math.min(limit,visible.length)} / ${visible.length} visible features`+(visible.length>limit?' · zoom in to inspect the remaining detail':'');
 }
 function fit(){if(!map||!data.features.length)return;const b=new maps.LatLngBounds();for(const f of data.features){b.extend({lat:f.bounds.south,lng:f.bounds.west});b.extend({lat:f.bounds.north,lng:f.bounds.east});}map.fitBounds(b,32);}
 async function connect(key){if(connecting)return;if(map){$('gmStatus').textContent='Reload the page to use a different Google API key.';return;}connecting=true;$('gmStatus').textContent='Loading Google satellite…';try{maps=await loadGoogleMaps(key);if(closed)return;oldAuthFailure=window.gm_authFailure;window.gm_authFailure=()=>{if(!closed){onReferenceLoaded(null);$('gmConnect').hidden=false;$('gmStatus').textContent='Google Maps authentication failed. Check billing, enabled API and website restrictions, then reload this page.';}};map=new maps.Map($('gmCanvas'),{center:data.origin,zoom:18,mapTypeId:'satellite',tilt:0,heading:0,streetViewControl:false,rotateControl:false});map.addListener('tilesloaded',()=>{if(!closed&&!referenceReported){referenceReported=true;onReferenceLoaded({provider:'Google satellite',loadedAt:Date.now(),imageryDate:'not supplied',mode:'visual-reference-only'});}});$('gmConnect').hidden=true;$('gmKey').value='';listener=map.addListener('idle',draw);fit();draw();$('gmStatus').textContent='Google satellite with our generated geometry. Visual comparison only; this does not certify accuracy.';}catch(e){if(!closed)$('gmStatus').textContent=e.message;}finally{connecting=false;}}
 $('gmVision').onchange=async()=>{try{const file=$('gmVision').files[0];if(!file)return;if(file.size>5000000)throw Error('Use a proposal file smaller than 5 MB.');const features=visionOverlay(JSON.parse(await file.text()));data.features=data.features.filter(f=>f.layer!=='proposals').concat(features);draw();$('gmStatus').textContent=features.length+' unverified vision proposals loaded for comparison. No map changes applied.';}catch(e){$('gmStatus').textContent=e.message;}};
 $('gmConnect').onsubmit=e=>{e.preventDefault();connect($('gmKey').value);};$('gmOpacity').oninput=draw;$('gmFit').onclick=fit;$('gmHide').onclick=()=>{hidden=!hidden;$('gmHide').textContent=hidden?'Show overlay':'Hide overlay';draw();};
 function close(){if(closed)return;closed=true;remove();listener?.remove();if(map)maps?.event?.clearInstanceListeners(map);window.gm_authFailure=oldAuthFailure;root.remove();onClose();}
 $('gmClose').onclick=close;root.addEventListener('cancel',e=>{e.preventDefault();close();});
 const configured=window.SLAYDRIVE_MAPS?.googleMapsBrowserKey;if(configured)connect(configured);
 return {close};
}
