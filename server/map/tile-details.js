import {boundsCheck} from '../../js/personal/geometry.js';
// Small supplementary query: the existing world broker omits these standalone
// features. Do not accept caller-supplied Overpass code or arbitrary endpoints.
export function tileDetailQuery(bounds){
 boundsCheck(bounds);const [south,west,north,east]=bounds;
 const width=(east-west)*111320*Math.cos((north+south)/2*Math.PI/180),height=(north-south)*110574;
 if(width>1250||height>1250)throw Error('Street detail requests are limited to a one kilometre tile and its buffer.');
 const b=bounds.join(',');return `[out:json][timeout:20][maxsize:8388608];(nwr[road_marking](${b});nwr[junction=box](${b});nwr[box_junction=yes](${b});way[amenity=parking_space](${b}););(._;>>;);out body;`;
}
