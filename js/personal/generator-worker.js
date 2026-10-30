import {generateSection,generateRoute} from './section.js';
self.onmessage=({data})=>{
  try{self.postMessage({track:(data.wholeRoute?generateRoute:generateSection)(data.osm,data.part)});}
  catch(error){self.postMessage({error:error.message});}
};
