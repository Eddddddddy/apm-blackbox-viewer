import {available,COLORS,motorChannels} from './signals.js';

const arm=1.09;
const ROTORS=[
  [ arm,-arm,'右前'],
  [-arm, arm,'左后'],
  [-arm,-arm,'左前'],
  [ arm, arm,'右后']
];

export function craftConfig(meta, channels=motorChannels(meta.params)) {
  const params=new Map(meta.params.map(p=>[p.name,p.value]));
  const frameClass=params.get('FRAME_CLASS');
  const frameType=params.get('FRAME_TYPE');
  const supported=(frameClass==null||frameClass===1)&&(frameType==null||frameType===1);
  const attitudeType=['ANG','ATT'].find(type=>['Roll','Pitch','Yaw'].every(field=>available({type,field},meta.catalog)));
  const attitudes=attitudeType ? ['Roll','Pitch','Yaw'].map(field=>({id:field,type:attitudeType,field})) : [];
  const motors=ROTORS.map(([x,z,position],i)=>{
    const instance=channels[i];
    const signal={id:'M'+(i+1),type:'ESC',field:'RPM',instance};
    return {x,z,position,color:COLORS[i],output:instance==null?null:instance+1,id:signal.id,
      signal:instance!=null&&available(signal,meta.catalog)?signal:null};
  });
  return {supported,attitudeType,motors,series:supported?[...attitudes,...motors.flatMap(m=>m.signal?[m.signal]:[])]:[]};
}

function wrappedDelta(value) {
  return ((value+180)%360+360)%360-180;
}

export function sampleAt(points,time,angle=false,maxAge=.35) {
  if(!points?.length)return undefined;
  let lo=0,hi=points.length/2;
  while(lo<hi){
    const mid=(lo+hi)>>>1;
    if(points[mid*2]<=time)lo=mid+1;else hi=mid;
  }
  if(!lo)return undefined;
  const p=(lo-1)*2,start=points[p],value=points[p+1];
  if(time-start>maxAge)return undefined;
  if(!angle||lo===points.length/2)return value;
  const next=points[p+2], gap=next-start;
  if(gap>0.35 || gap<=0)return value;
  return value+wrappedDelta(points[p+3]-value)*(time-start)/gap;
}

// Body axes are right/up/back. ArduPilot positive roll drops the right side,
// positive pitch raises the nose, and positive yaw turns the nose right.
export function attitudeTransform(roll,pitch,yaw) {
  const rad=Math.PI/180;
  const r=-roll*rad,p=pitch*rad,y=-yaw*rad;
  const cr=Math.cos(r),sr=Math.sin(r),cp=Math.cos(p),sp=Math.sin(p),cy=Math.cos(y),sy=Math.sin(y);
  return ([x,y,z])=>{
    const rx=x*cr-y*sr,ry=x*sr+y*cr;
    const py=ry*cp-z*sp,pz=ry*sp+z*cp;
    return [rx*cy+pz*sy,py,-rx*sy+pz*cy];
  };
}
