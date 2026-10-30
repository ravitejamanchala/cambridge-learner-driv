import {decode,measure,coordinate} from './geometry.js';
export const ROUTES_KEY='slaydrive.personal-routes.v1', CACHE_KEY='slaydrive.personal-map-cache.v1';
export const GENERATOR_VERSION=3;
export function validateRecipe(r) {
  if(!r||r.version!==1||typeof r.id!=='string'||!/^[-a-z0-9]{1,70}$/.test(r.id)||typeof r.title!=='string'||!r.title.trim()||r.title.length>120||!Number.isFinite(r.createdAt)||!Number.isFinite(r.distance)||r.distance<10)throw Error('Invalid saved route.');
  coordinate(r.start);coordinate(r.end);measure(decode(r.geometry));return r;
}
export function routeStore(storage=globalThis.localStorage) {
  const read=()=>{const text=storage.getItem(ROUTES_KEY);if(!text)return[];try{const d=JSON.parse(text);if(d.version!==1||!Array.isArray(d.routes))throw Error();return d.routes.map(validateRecipe);}catch{throw Error('Saved routes could not be read. Your stored data has been kept.');}};
  const write=routes=>{try{storage.setItem(ROUTES_KEY,JSON.stringify({version:1,routes}));}catch{throw Error('Browser storage is full or disabled. Delete a saved route or allow site storage, then save again.');}};
  return {list:read,save(r){validateRecipe(r);const rows=read(),i=rows.findIndex(x=>x.id===r.id);if(i<0)rows.unshift(r);else rows[i]=r;write(rows);return r;},remove(id){write(read().filter(r=>r.id!==id));this.clearCache(id);},clearCache(id){try{const d=JSON.parse(storage.getItem(CACHE_KEY)||'[]');storage.setItem(CACHE_KEY,JSON.stringify(d.filter(x=>!x.key.startsWith(id+':'))));}catch{}},getSection(id,index){try{const rows=JSON.parse(storage.getItem(CACHE_KEY)||'[]'),entry=rows.find(x=>x.key===`${id}:${GENERATOR_VERSION}:${index}`);return entry?.track||null;}catch{return null;}},putSection(id,index,track){
    // Discardable, bounded cache. Saved recipes are never evicted to make space.
    try{const key=`${id}:${GENERATOR_VERSION}:${index}`,rows=JSON.parse(storage.getItem(CACHE_KEY)||'[]').filter(x=>x.key!==key);rows.unshift({key,track});while(JSON.stringify(rows).length>850000&&rows.length)rows.pop();while(rows.length){try{storage.setItem(CACHE_KEY,JSON.stringify(rows));return;}catch{rows.pop();}}storage.removeItem(CACHE_KEY);}catch{}
  }};
}
