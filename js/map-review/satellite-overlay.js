import * as L from '../vendor/leaflet.js';
import {overlayGeometry} from './geometry.js';
import {buildNet} from '../net.js';
import {applyMappedRoadTags} from '../mapped-road-tags.js';
const SERVICE='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
// Display the provider's imagery as reference only. No pixels are read, exported,
// cached by the app, passed to a model, or converted into map geometry.
export function openSatelliteOverlay(track,{onClose=()=>{},onReferenceLoaded=()=>{}}={}){
 const net=buildNet(track.renderNetwork||track.network);applyMappedRoadTags(net,track.osm?.ways);const data=overlayGeometry(track,net);
 const dialog=document.createElement('dialog');dialog.id='satelliteReview';dialog.innerHTML=`<header><h2>Satellite comparison · generated map</h2><button id="satClose">Close comparison</button></header><div class="sat-tools"><label>Geometry opacity <input id="satOpacity" type="range" min="0" max="100" value="45"></label><button id="satHide">Hide generated geometry</button><button id="satFit">Fit map</button><p id="satStatus" role="status">Loading satellite reference…</p><p>Esri World Imagery · <a href="https://goto.arcgisonline.com/maps/World_Imagery" target="_blank" rel="noreferrer">sources and terms</a>. Imagery age and detail vary. This is a visual comparison, not an accuracy certificate.</p></div><div id="satMap"></div>`;
 document.body.append(dialog);dialog.showModal();const $=id=>dialog.querySelector('#'+id);let closed=false,hidden=false,loaded=0,failed=0;
 const map=L.map($('satMap')).setView([data.origin.lat,data.origin.lng],18),tiles=L.tileLayer(SERVICE+'/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery © Esri, Vantor, Earthstar Geographics, GIS User Community · Map geometry © OpenStreetMap contributors'}).addTo(map);
 const colors={roads:'#ed398a',paint:'#ffffff',boxes:'#ffd249',parking:'#65db95',buildings:'#bd8aff',centreline:'#1dd9e4'};
 const groups={};for(const k of Object.keys(colors))groups[k]=L.layerGroup().addTo(map);
 const bounds=L.latLngBounds([]),shapes=[];
 for(const f of data.features){if(!groups[f.layer])continue;const paths=f.paths.map(p=>p.map(q=>[q.lat,q.lng]));const options={color:colors[f.layer],weight:f.layer==='paint'?1:2,opacity:.45,fillOpacity:.20};const shape=f.polygon?L.polygon(paths,options):L.polyline(paths[0],options);shape.addTo(groups[f.layer]);bounds.extend(shape.getBounds());shapes.push(shape);const detail=document.createElement('p');detail.textContent=f.id+' · '+f.detail;shape.bindPopup(detail);}
 L.control.layers({},Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v])),{collapsed:false}).addTo(map);
 function fit(){if(bounds.isValid())map.fitBounds(bounds,{padding:[24,24],maxZoom:18});}
 function receipt(){return {provider:'Esri World Imagery',service:SERVICE,loadedAt:Date.now(),imageryDate:'not supplied',mode:'visual-reference-only',view:map.getBounds().toBBoxString(),attribution:'Esri, Vantor, Earthstar Geographics, GIS User Community'};}
 tiles.on('loading',()=>{loaded=failed=0;});tiles.on('tileload',()=>{loaded++;});tiles.on('tileerror',()=>{failed++;});tiles.on('load',()=>{if(closed)return;const ready=loaded>0&&failed===0;onReferenceLoaded(ready?receipt():null);$('satStatus').textContent=ready?'Satellite tiles loaded. Toggle geometry to compare roads, junctions, paint, parking and buildings.':'Satellite reference is incomplete or unavailable. Retry by moving the map; review remains pending.';});
 const style=()=>{const opacity=hidden?0:Number($('satOpacity').value)/100;shapes.forEach(s=>s.setStyle({opacity,fillOpacity:opacity*.45}));};
 $('satOpacity').oninput=style;$('satHide').onclick=()=>{hidden=!hidden;$('satHide').textContent=hidden?'Show generated geometry':'Hide generated geometry';style();};$('satFit').onclick=fit;
 function close(){if(closed)return;closed=true;map.remove();dialog.remove();onClose();}
 $('satClose').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});requestAnimationFrame(()=>{if(!closed){map.invalidateSize();fit();}});return {close};
}
