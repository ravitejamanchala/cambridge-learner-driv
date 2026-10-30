import {validateRecipe} from './storage.js';
import {validate} from '../editor-track.js';
export const WORLD_PREFIX='slaydrive.personal-world.v1:';
const fingerprint=r=>({geometry:r.geometry,start:r.start,end:r.end,distance:r.distance});
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
function checkTrack(track){
  const errors=validate(track);
  if(track?.renderNetwork)errors.push(...validate({...track,network:track.renderNetwork}));
  if(!Array.isArray(track?.plan?.nodes)||track.plan.nodes.length<2||!track.plan.nodes.every(n=>Number.isInteger(n)&&n>=0&&n<track.network.nodes.length/2))errors.push('Missing prepared driving route');
  if(errors.length)throw Error('Saved map is invalid: '+[...new Set(errors)].join('; '));
}
export async function saveWorld(recipe,track,review,{store,storage=globalThis.localStorage}={}){
  validateRecipe(recipe);checkTrack(track);
  if(!review||!['pending','visual-review','needs-correction'].includes(review.status))throw Error('Invalid map review.');
  if(review.status!=='pending'&&(!review.reference?.loadedAt||!review.notes?.trim()||!['roads','junctions','markings','parking','buildings'].every(k=>['aligned','mismatch','unknown'].includes(review.checks?.[k]))))throw Error('Complete the satellite review before saving its result.');
  // Each save is a new immutable revision. The index is committed last; quota
  // failure rolls back only the new payload, never an earlier saved map.
  const id=crypto.randomUUID(),createdAt=Date.now(),key=WORLD_PREFIX+id;
  const payload=JSON.stringify({version:1,route:fingerprint(recipe),track,review,createdAt,parentRevision:recipe.savedWorld?{id:recipe.id,sha256:recipe.savedWorld.sha256}:null});
  const hash=await digest(payload),saved={...recipe,id,createdAt,savedWorld:{key,sha256:hash,reviewStatus:review.status,createdAt}};
  try{storage.setItem(key,payload);store.save(saved);}catch(e){storage.removeItem(key);throw Error('Could not save this map. Browser storage may be full or disabled. Earlier maps are kept. '+e.message);}
  return saved;
}
export async function restoreWorld(recipe,{storage=globalThis.localStorage}={}){
  const ref=recipe.savedWorld;
  if(!ref||!ref.key?.startsWith(WORLD_PREFIX)||!/^[-a-z0-9]{1,70}$/.test(ref.key.slice(WORLD_PREFIX.length))||!/^[a-f0-9]{64}$/.test(ref.sha256))throw Error('Invalid saved map reference.');
  const payload=storage.getItem(ref.key);
  if(!payload)throw Error('This saved map is missing. Return to World inspector to save another revision. It will not be regenerated automatically.');
  if(await digest(payload)!==ref.sha256)throw Error('Saved map checksum failed. The stored data has been kept; this map cannot be driven.');
  const data=JSON.parse(payload);
  if(data.version!==1||JSON.stringify(data.route)!==JSON.stringify(fingerprint(recipe)))throw Error('Saved map does not match this route. Save a new revision from World inspector.');
  checkTrack(data.track);return data;
}
