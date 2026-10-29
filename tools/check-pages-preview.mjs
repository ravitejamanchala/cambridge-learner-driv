// Run in GitHub Actions when the cloud executor cannot reach the existing Pages domain.
const base='https://manchala.co.uk/cambridge-learner-driv/';
async function get(file){const response=await fetch(base+file+'?verify='+Date.now(),{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(file+': HTTP '+response.status);return response.text();}
const [html,config,release]=await Promise.all([get('index.html'),get('auth-config.js'),get('release.json')]);
if(!config.includes('BROWSER_AUTHORING:true')||config.includes('CLERK_PUBLISHABLE_KEY'))throw Error('Pages sandbox config is not live');
const app=html.match(/src="(app\.js[^\"]*)"/);if(!app)throw Error('Bundled app not found');
const script=await get(app[1].split('?')[0]);if(!script.includes('Browser JSON route library'))throw Error('JSON editor bundle is not live');
const areas=JSON.parse(await get('data/areas/index.json'));if(!areas.areas.length)throw Error('Map index unavailable');
console.log('Live Pages HTML, browser-only configuration, editor bundle and map index verified:',base,JSON.parse(release).sourceCommit);
