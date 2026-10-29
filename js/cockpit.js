import {cockpitState} from './cockpit-state.js';

// Original SlayDrive interior. Three canvases, updated only while visible, are
// instruments in the 3D dashboard rather than DOM panels pasted over the road.
export function createCockpit(T, {camera, mirrors, seat, car}) {
 const group = new T.Group(); camera.add(group); group.visible = false;
 const surfaces = [], materials = [], geometries = [];
 const material = (colour, shininess=12) => {const m=new T.MeshPhongMaterial({color:colour,shininess,specular:0x262b30});materials.push(m);return m;};
 const dashM=material(0x202930,9), leather=material(0x784b38,7), dark=material(0x11191e,6), metal=material(0x8b979c,65), wood=material(0x443b33,18), wheelM=material(0x171d22,12);
 const bonnetMaterial=material(0x1d6a46,38), span=[];
 const mesh=(g,m,x,y,z,parent=group)=>{geometries.push(g);const o=new T.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;};
 const box=(w,h,d,m,x,y,z,parent=group)=>mesh(new T.BoxGeometry(w,h,d),m,x,y,z,parent);
 function rounded(w,h,d,r,m,x,y,z,parent=group){
  const s=new T.Shape(),a=-w/2,b=-h/2;r=Math.min(r,w/2,h/2);
  s.moveTo(a+r,b);s.lineTo(a+w-r,b);s.quadraticCurveTo(a+w,b,a+w,b+r);s.lineTo(a+w,b+h-r);s.quadraticCurveTo(a+w,b+h,a+w-r,b+h);s.lineTo(a+r,b+h);s.quadraticCurveTo(a,b+h,a,b+h-r);s.lineTo(a,b+r);s.quadraticCurveTo(a,b,a+r,b);
  const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:6});g.translate(0,0,-d/2);return mesh(g,m,x,y,z,parent);
 }
 const across=o=>{span.push(o);return o;};
 across(rounded(2.34,.20,.40,.06,dashM,-seat.x,-.35,-1.25));
 across(rounded(2.35,.65,.3,.06,leather,-seat.x,-.85,-.96));
 across(box(2.33,.065,.035,wood,-seat.x,-.52,-.735));
 across(box(2.33,.008,.025,metal,-seat.x,-.477,-.716));
 across(box(2.3,.055,.02,dark,-seat.x,-.568,-.73));
 across(box(1.9,.06,1.7,bonnetMaterial,-seat.x,-.66,-1.95));
 across(rounded(2.3,.10,.62,.025,dashM,-seat.x,.63,-.95));
 across(box(2.3,.05,1.1,dashM,-seat.x,.69,-.2));
 // Stitched upper trim: one thin continuous seam, not a texture repeated at every window.
 across(box(2.25,.004,.012,metal,-seat.x,-.245,-1.04));
 const pillars=[-1,1].map(side=>{const p=rounded(.064,1.22,.075,.025,dashM,-seat.x+side*.99,.2,-1.22);p.rotation.z=-side*.25;p.rotation.x=-.37;return p;});
 const doors=[];
 for(const side of [-1,1]){
  doors.push(box(.10,.09,1.9,dashM,-seat.x+side*1.02,.5,-.1));
  doors.push(rounded(.14,.78,1.9,.04,leather,-seat.x+side*1.02,-.62,-.1));
  doors.push(box(.15,.032,1.7,wood,-seat.x+side*1.015,-.31,-.16));
 }
 function screen(w,h,x,y,z,width,height){
  rounded(w+.036,h+.036,.035,.024,dark,x,y,z-.02);
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const texture=new T.CanvasTexture(c);texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;texture.anisotropy=2;
  const m=new T.MeshBasicMaterial({map:texture,toneMapped:false});materials.push(m);
  mesh(new T.PlaneGeometry(w,h),m,x,y,z+.001);
  const result={canvas:c,g:c.getContext('2d'),texture};surfaces.push(result);return result;
 }
 const navigation=screen(.48,.285,-.50,-.28,-.876,768,400);
 const cluster=screen(.72,.29,.13,-.28,-.874,960,400);
 const journey=screen(.35,.285,-.945,-.28,-.876,480,400);
 function vent(x,y){
  mesh(new T.TorusGeometry(.066,.008,8,32),metal,x,y,-.725);
  mesh(new T.CircleGeometry(.061,32),dark,x,y,-.731);
  for(let i=-2;i<=2;i++)box(.105,.003,.01,metal,x,y+i*.016,-.72);
 }
 vent(-.94,-.61);vent(.66,-.61);
 rounded(.48,.072,.022,.018,dark,-.49,-.62,-.72);
 for(let i=0;i<6;i++)box(.058,.002,.005,metal,-.68+i*.075,-.615,-.704);
 // A sculpted hub and broad three-spoke wheel, connected to the actual steering value.
 const wheel=new T.Group();wheel.position.set(.12,-.37,-.80);wheel.rotation.x=-.23;group.add(wheel);
 mesh(new T.TorusGeometry(.245,.027,12,64),wheelM,0,0,0,wheel);
 mesh(new T.TorusGeometry(.216,.005,6,64),metal,0,0,-.006,wheel);
 rounded(.22,.145,.055,.05,dark,0,0,.012,wheel);
 for(const side of [-1,1]){
  const spoke=rounded(.16,.065,.032,.018,wheelM,side*.148,-.005,-.012,wheel);spoke.rotation.z=-side*.12;
  rounded(.08,.046,.012,.01,dark,side*.145,.004,.012,wheel);
  for(let j=0;j<2;j++)box(.023,.003,.003,metal,side*.145,-.006+j*.018,.02,wheel);
 }
 const bottom=rounded(.055,.17,.035,.018,wheelM,0,-.151,-.012,wheel);bottom.rotation.z=.05;
 const logo=document.createElement('canvas');logo.width=256;logo.height=128;const lg=logo.getContext('2d');lg.fillStyle='#d6e2e2';lg.textAlign='center';lg.font='600 25px sans-serif';lg.fillText('SLAYDRIVE',128,73);const lm=new T.CanvasTexture(logo);const lmat=new T.MeshBasicMaterial({map:lm,transparent:true,toneMapped:false});materials.push(lmat);mesh(new T.PlaneGeometry(.16,.08),lmat,0,0,.042,wheel);
 // Wipers rest below the useful forward sightline.
 for(const x of [-.64,.04]){const w=box(.48,.008,.012,dark,x,-.202,-1.39);w.rotation.z=.04;}
 // Static trim shares a handful of materials. Batch it once (and when the car
 // changes) instead of submitting every seam, vent slat and spoke every frame.
 function batch(parent,parts){
  const batches=[],byMaterial=new Map();
  for(const part of parts){parent.remove(part);const list=byMaterial.get(part.material)||[];list.push(part);byMaterial.set(part.material,list);}
  function rebuild(){
   for(const old of batches){parent.remove(old);old.geometry.dispose();}batches.length=0;
   for(const [mat,list] of byMaterial){
    const copies=list.map(part=>{part.updateMatrix();const copy=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();copy.applyMatrix4(part.matrix);return copy;});
    const geometry=new T.BufferGeometry();
    for(const key of ['position','normal','uv']){const size=copies[0].attributes[key].itemSize,total=copies.reduce((n,g)=>n+g.attributes[key].array.length,0),values=new Float32Array(total);let offset=0;for(const copy of copies){values.set(copy.attributes[key].array,offset);offset+=copy.attributes[key].array.length;}geometry.setAttribute(key,new T.BufferAttribute(values,size));}
    for(const copy of copies)copy.dispose();geometry.computeBoundingSphere();const merged=new T.Mesh(geometry,mat);parent.add(merged);batches.push(merged);
   }
  }
  rebuild();return {rebuild,dispose(){for(const m of batches)m.geometry.dispose();}};
 }
 const trimBatch=batch(group,group.children.filter(o=>o.isMesh&&o.material!==bonnetMaterial));
 const wheelBatch=batch(wheel,[...wheel.children]);
 mirrors.mount(group,seat.x);mirrors.mountChase(camera);
 let lastUpdate=-Infinity,lastNet=null,updates=0,state=null;
 const font=(g,size,weight=500)=>{g.font=weight+' '+size+'px system-ui, sans-serif';};
 const text=(g,value,x,y,size=20,colour='#dfebeb',align='left')=>{g.fillStyle=colour;g.textAlign=align;font(g,size);g.fillText(String(value),x,y);};
 function backdrop(g,w,h){g.fillStyle='#0c171c';g.fillRect(0,0,w,h);g.fillStyle='#182a31';g.fillRect(0,h-48,w,48);}
 function instrument(s){
  const g=cluster.g,w=cluster.canvas.width,h=cluster.canvas.height;backdrop(g,w,h);
  text(g,'SLAYDRIVE',42,42,22,'#8aa5aa');text(g,s.mode,w-35,42,18,'#8aa5aa','right');
  const cx=480,cy=215,r=111,start=Math.PI*.77,end=Math.PI*2.23;
  g.lineWidth=10;g.strokeStyle='#263e46';g.beginPath();g.arc(cx,cy,r,start,end);g.stroke();
  g.strokeStyle='#91d7bd';g.beginPath();g.arc(cx,cy,r,start,start+(end-start)*Math.min(1,s.speed/80));g.stroke();
  for(let speed=0;speed<=80;speed+=10){const a=start+(end-start)*speed/80;g.strokeStyle='#718b91';g.lineWidth=2;g.beginPath();g.moveTo(cx+Math.cos(a)*(r-8),cy+Math.sin(a)*(r-8));g.lineTo(cx+Math.cos(a)*(r-17),cy+Math.sin(a)*(r-17));g.stroke();text(g,speed,cx+Math.cos(a)*(r-32),cy+Math.sin(a)*(r-32)+6,17,'#a7b9bc','center');}
  text(g,s.speed,cx,cy+16,84,'#f1f8f7','center');text(g,'mph',cx,cy+49,20,'#94acae','center');
  text(g,s.gear,90,246,66,'#ecf5f3','center');text(g,'GEAR',90,278,16,'#8aa5aa','center');
  if(s.limit!==null){g.fillStyle='#f6f4ec';g.beginPath();g.arc(125,117,32,0,Math.PI*2);g.fill();g.strokeStyle='#c84b4f';g.lineWidth=7;g.stroke();text(g,s.limit,125,127,27,'#17242b','center');if(s.limitEstimated)text(g,'estimated',125,165,13,'#a9b8bc','center');}
  text(g,s.icon==='left'?'↰':s.icon==='right'?'↱':s.icon==='rb'?'↻':s.icon==='stop'?'⚑':'↑',730,161,58,'#91d7bd','center');text(g,s.distanceText,841,161,34,'#edf6f4','center');text(g,'NEXT MANOEUVRE',794,202,14,'#8aa5aa','center');
  const turn=s.turn.length>34?s.turn.slice(0,32)+'…':s.turn;text(g,turn.slice(0,25),790,244,18,'#edf6f4','center');
  g.fillStyle='#28414a';g.fillRect(654,281,258,5);g.fillStyle='#91d7bd';g.fillRect(654,281,258*s.progress,5);text(g,s.remainingText+' remaining',790,321,17,'#9db2b5','center');
  text(g,s.indicator==='L'?'◀':'',53,205,42,'#83e1a8');text(g,s.indicator==='R'?'▶':'',906,205,42,'#83e1a8','right');
  text(g,s.parkingBrake?'PARKING BRAKE':s.engine?'READY':'ENGINE OFF',30,h-17,20,s.parkingBrake?'#f4af7b':'#91d7bd');text(g,s.beltWarning?'FASTEN BELT':s.headlights?'DIPPED LIGHTS':'',w-30,h-17,18,s.beltWarning?'#f4af7b':'#91d7bd','right');
 }
 function routeMap(p,t,net,s){
  const {g,canvas:c}=navigation,w=c.width,h=c.height;g.fillStyle='#d9e0d3';g.fillRect(0,0,w,h);
  g.save();g.beginPath();g.rect(0,70,w,h-118);g.clip();const k=2.1;g.translate(w/2,h*.65);g.rotate(p.th);g.scale(k,k);g.translate(-p.x,-p.z);
  const range=240,C=net.chunkSize,edges=new Set();
  for(let x=Math.floor((p.x-range)/C);x<=Math.floor((p.x+range)/C);x++)for(let z=Math.floor((p.z-range)/C);z<=Math.floor((p.z+range)/C);z++)for(const e of net.chunks.get(net.ck(x,z))||[])edges.add(e);
  g.lineCap='round';g.lineJoin='round';
  for(const [colour,extra] of [['#b4c0ba',4],['#f8faf4',0]]){g.strokeStyle=colour;for(const e of edges){g.lineWidth=Math.max(2,e.way.w+extra);g.beginPath();for(let i=0;i<e.n;i++)i?g.lineTo(e.px[i],e.pz[i]):g.moveTo(e.px[i],e.pz[i]);g.stroke();}}
  const r=t.route;if(r?.xs?.length){g.strokeStyle='#258a71';g.lineWidth=4;g.beginPath();let drawing=false;for(let i=0;i<r.xs.length;i++){const near=Math.abs(r.xs[i]-p.x)<range&&Math.abs(r.zs[i]-p.z)<range;if(near||drawing){if(drawing)g.lineTo(r.xs[i],r.zs[i]);else if(i){g.moveTo(r.xs[i-1],r.zs[i-1]);g.lineTo(r.xs[i],r.zs[i]);}else g.moveTo(r.xs[i],r.zs[i]);}drawing=near;}g.stroke();}
  g.restore();g.fillStyle='#165643';g.strokeStyle='#fff';g.lineWidth=3;g.beginPath();g.moveTo(w/2,h*.65-13);g.lineTo(w/2+10,h*.65+11);g.lineTo(w/2,h*.65+6);g.lineTo(w/2-10,h*.65+11);g.closePath();g.fill();g.stroke();
  g.fillStyle='#143b35';g.fillRect(0,0,w,70);text(g,s.turn.slice(0,32),24,43,25,'#edf7ef');text(g,s.distanceText,w-20,43,24,'#b8e5cc','right');g.fillStyle='#14282e';g.fillRect(0,h-48,w,48);text(g,s.road.slice(0,40),20,h-17,23);text(g,s.remainingText,w-18,h-17,20,'#a8c5c7','right');
 }
 function journeyDisplay(s){const {g,canvas:c}=journey;backdrop(g,c.width,c.height);const now=new Date();text(g,'YOUR DRIVE',28,47,21,'#94b5b5');text(g,now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),c.width/2,165,78,'#eff5f0','center');text(g,now.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}),c.width/2,208,22,'#a9bebd','center');text(g,s.mode,c.width/2,290,21,'#91d7bd','center');text(g,'Focus on the road ahead',c.width/2,c.height-19,18,'#a9bebd','center');}
 function update(player,test,net,clock,{lowPower=false,force=false}={}){
  if(!group.visible||!net||!test)return;
  if(!force&&net===lastNet&&clock>=lastUpdate&&clock-lastUpdate<(lowPower?.25:.1))return;
  lastUpdate=clock;lastNet=net;state=cockpitState(player,test,clock);instrument(state);routeMap(player,test,net,state);journeyDisplay(state);for(const s of surfaces)s.texture.needsUpdate=true;updates++;
 }
 function fit(metrics){
  if(!metrics)return;bonnetMaterial.color.setHex(metrics.colour);const width=Math.max(1.5,Math.min(2.2,metrics.width));seat.x=car.seat.x*width/1.9;seat.y=car.seat.y+Math.max(-.12,Math.min(.2,(metrics.height-1.33)*.5));
  for(const o of span){o.scale.x=width/1.9;o.position.x=-seat.x;}
  for(const [i,o] of doors.entries())o.position.x=-seat.x+(i<3?-1:1)*width*.54;
  for(const [i,o] of pillars.entries())o.position.x=-seat.x+(i?1:-1)*width*.52;
  trimBatch.rebuild();
  mirrors.mount(group,seat.x);
 }
 return {group,wheel,bonnetMaterial,fit,update,get telemetry(){return state?{...state,updates}:null;},dispose(){trimBatch.dispose();wheelBatch.dispose();for(const s of surfaces)s.texture.dispose();lm.dispose();for(const g of new Set(geometries))g.dispose();for(const m of materials)m.dispose();camera.remove(group);}};
}
