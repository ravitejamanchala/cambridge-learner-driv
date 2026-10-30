import {generateTile} from './model.js';
self.onmessage=({data})=>{try{self.postMessage({tile:generateTile(data.osm,data.center)});}catch(e){self.postMessage({error:e.message});}};
