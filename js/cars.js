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
export const carById = id => CARS.find(car=>car.id===id) || CARS[0];
