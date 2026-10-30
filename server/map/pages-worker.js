import {handleMapRequest} from './handler.js';
export default {fetch(request,env){return new URL(request.url).pathname.startsWith('/map-api/')?handleMapRequest(request,env):env.ASSETS.fetch(request);}};
