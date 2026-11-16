const FRAME_MESSAGES=['ANG','RATE','ATT','CTUN','RCIN','IMU','GYR'];

export function frameSignal(catalog) {
  const def=FRAME_MESSAGES.map(name=>catalog.find(d=>d.name===name&&d.count>1)).find(Boolean)
    ??catalog.find(d=>d.count>1);
  return def?{id:'frame-time',type:def.name,field:'TimeUS',instance:def.instances[0]}:null;
}

function timeBound(points,time,afterEqual) {
  let lo=0,hi=points.length/2;
  while(lo<hi){
    const mid=(lo+hi)>>>1;
    const stamp=points[mid*2];
    if(stamp<time||(afterEqual&&stamp===time))lo=mid+1;
    else hi=mid;
  }
  return lo;
}

export function frameStep(points,time,direction,count,scope) {
  if(!points?.length)return {time:null,count:0};
  const first=timeBound(points,scope[0],false);
  const end=timeBound(points,scope[1],true);
  let index=direction>0
    ?Math.max(first,timeBound(points,time,true))
    :Math.min(end,timeBound(points,time,false))-1;
  let target=null,moved=0;
  while(index>=first&&index<end&&moved<count){
    const stamp=points[index*2];
    if(stamp!==target){target=stamp;moved++;}
    index+=direction;
  }
  return {time:target,count:moved};
}
