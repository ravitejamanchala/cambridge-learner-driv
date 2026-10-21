export const CARS = [
  {id:'rx7',title:'RX-7',url:'models/rx7.json'},
  {id:'compact',title:'Blue compact',url:'models/NormalCar1.glb',supplied:true},
  {id:'hatchback',title:'City hatchback',url:'models/NormalCar2.glb',supplied:true},
  {id:'suv',title:'SUV',url:'models/SUV.glb',supplied:true},
  {id:'sports',title:'Sports coupe',url:'models/SportsCar.glb',supplied:true},
  {id:'sports-2',title:'Sports coupe 2',url:'models/SportsCar2.glb',supplied:true},
  {id:'taxi',title:'Taxi',url:'models/Taxi.glb',supplied:true},
  {id:'police',title:'Police car',url:'models/Cop.glb',supplied:true},
];
export const carPreview = car => 'models/car-' + car.id + '.png';
export const carHeadline = car => ({rx7:'RX-7',compact:'COMPACT',hatchback:'HATCH',suv:'SUV',sports:'COUPE','sports-2':'COUPE II',taxi:'TAXI',police:'POLICE'})[car.id];
export const carById = id => CARS.find(car=>car.id===id) || CARS[0];

// Everything on the road is one of the cars in the garage, so the traffic, the parked cars and the
// learner's own car all look like they belong in the same world. The police car is in here too and
// also serves as the blue-light vehicle, which is the one that gets a light bar on its roof.
export const TRAFFIC_CAR_IDS = CARS.map(car => car.id);
export const EMERGENCY_CAR_ID = 'police';
export const DRIVER_CAR_ID = 'rx7';
// The supplied GLB models share one wheel naming convention and need capping to a sane width.
export const SUPPLIED = { yaw: 0, hide: null, maxWidth: 1.8, wheel: mesh => /Wheel/i.test(mesh.name) || /Wheel/i.test(mesh.parent?.name || '') };
export const trafficCars = () => CARS.filter(car => TRAFFIC_CAR_IDS.includes(car.id));
export const modelSpec = id => { const car = carById(id); return { url: car.url, options: car.supplied ? SUPPLIED : {} }; };
