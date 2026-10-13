import { HANDLING } from './config.js';
import { wrapAngle, gradeParking } from './parking-geometry.js';
// Developer test driver follows the optional parking guide using the same controls as a learner.
export function createParkingDriver(api) {
  let context=null,index=0,leg=-1;
  return () => {
    const p=api.player, status=api.scenarioStatus(), t=api.A.test;
    if (!status) return {throttle:0,brake:1,steer:0};
    if(context!==t.context||leg!==status.leg){context=t.context;leg=status.leg;index=0;}
    const brake={throttle:0,brake:1,steer:0};
    if(status.phase==='prepare'){
      if(Math.abs(p.v)<.05&&p.rawInput?.brake>=.5){if(p.operation.gear!==status.gear)api.gear(status.gear);if(p.operation.parkingBrake)api.operate('parkingBrake');api.look();}
      return brake;
    }
    if(status.phase==='secure'){
      if(Math.abs(p.v)<.05&&p.rawInput?.brake>=.5){if(p.operation.gear!=='P')api.gear('P');if(!p.operation.parkingBrake)api.operate('parkingBrake');if(p.operation.engine)api.operate('engine');}
      return brake;
    }
    if(api.A.traffic.clock-p.lookAt>4)api.look();
    const reverse=status.gear==='R', half=HANDLING.wheelbase/2;
    const path=status.path.map((q,i,list)=>{
      let dx,dz;
      if(i===list.length-1){dx=(reverse?-1:1)*-Math.sin(status.target.th);dz=(reverse?-1:1)*-Math.cos(status.target.th);}
      else {dx=list[i+1].x-q.x;dz=list[i+1].z-q.z;const L=Math.hypot(dx,dz)||1;dx/=L;dz/=L;}
      return {x:q.x+(reverse?1:-1)*dx*half,z:q.z+(reverse?1:-1)*dz*half};
    });
    const axle={x:p.x+Math.sin(p.th)*half,z:p.z+Math.cos(p.th)*half};
    const distance=Math.hypot(p.x-status.target.x,p.z-status.target.z);
    // Locate the nearest reference segment, then look 1.5 m along it. Progress never comes from a teleport.
    let best=index,bestD=Infinity,bestU=0;
    for(let i=Math.max(0,index-2);i<path.length-1;i++){
      const a=path[i],b=path[i+1],dx=b.x-a.x,dz=b.z-a.z,L2=dx*dx+dz*dz;
      const u=Math.max(0,Math.min(1,((axle.x-a.x)*dx+(axle.z-a.z)*dz)/(L2||1)));
      const d=Math.hypot(axle.x-a.x-dx*u,axle.z-a.z-dz*u);
      if(d<bestD){bestD=d;best=i;bestU=u;}
    }
    index=best;let remaining=1.5,q=null;
    for(let i=best;i<path.length-1;i++){
      const a=path[i],b=path[i+1],L=Math.hypot(b.x-a.x,b.z-a.z),u=i===best?bestU:0,left=L*(1-u);
      if(remaining<=left){const f=u+remaining/L;q={x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f};break;}remaining-=left;
    }
    q ||= path.at(-1);
    const desired=Math.atan2(-(q.x-axle.x),-(q.z-axle.z))-(reverse?Math.PI:0),error=wrapAngle(desired-p.th);
    const angle=wrapAngle(status.target.th-p.th);
    const inTarget=gradeParking(status.target,p);
    const shouldStop=distance<.13 || (distance<.35&&inTarget.inside&&Math.abs(angle)<.1);
    if(shouldStop)return brake;
    const desiredSpeed=distance<1?Math.max(.15,distance*.55):.85;
    return {throttle:0,brake:Math.abs(p.v)>desiredSpeed?.25:0,steer:Math.max(-1,Math.min(1,Math.atan((reverse?-1:1)*2*HANDLING.wheelbase*Math.sin(error)/Math.max(.3,Math.hypot(q.x-axle.x,q.z-axle.z)))/HANDLING.maxSteer/HANDLING.steerSensitivity))};
  };
}
