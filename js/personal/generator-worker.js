import {generateSection} from './section.js';
self.onmessage=({data})=>{
  try{self.postMessage({track:generateSection(data.osm,data.part)});}
  catch(error){self.postMessage({error:error.message});}
};
