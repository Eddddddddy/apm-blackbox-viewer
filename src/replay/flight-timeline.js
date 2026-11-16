import {modeName} from './signals.js';

const MODES = {
  0:['#455d89','#eef3ff'], 1:['#6b4e91','#faf0ff'], 2:['#49683a','#f0f8e7'],
  3:['#3958a0','#f0f4ff'], 4:['#845681','#ffedfc'], 5:['#1d6669','#e5fcf9'],
  6:['#873f54','#ffeff3'], 7:['#6b5940','#fff2dc'], 9:['#834d32','#fff0e5'],
  16:['#387667','#e7fff5'], 17:['#735545','#ffede3'], 20:['#794c74','#fff0fe'],
  21:['#6a4056','#ffeaf4'], 22:['#476e55','#e4f9eb']
};
const STATES = {
  locked:{id:'locked',label:'已上锁',color:'#353c44',ink:'#e0e5e8'},
  unknown:{id:'unknown',label:'状态未记录',color:'#2e333a',ink:'#d7dce0'},
  ground:{id:'ground',label:'已解锁待离地',color:'#77582b',ink:'#fff1d2'},
  landed:{id:'landed',label:'落地待上锁',color:'#615941',ink:'#fff3d9'},
  armed:{id:'armed',label:'已解锁',color:'#69514a',ink:'#fff1e7'},
  air:{id:'air',label:'空中 · 模式未知',color:'#415873',ink:'#eef5ff'}
};
const MARKERS = {
  arm:{label:'解锁',color:'#ffc079'},
  takeoff:{label:'离地',color:'#c0e693'},
  land:{label:'落地',color:'#e9ddaa'},
  disarm:{label:'上锁',color:'#dde3e8'}
};

export function flightModeStyle(mode) {
  if (mode==null) return STATES.air;
  const [color,ink]=MODES[mode]??[`hsl(${(mode*137.5)%360} 36% 40%)`,'#fff'];
  return {id:'mode-'+mode,label:modeName(mode),color,ink};
}

export function buildFlightTimeline({duration,events,flights}) {
  const arming=events.some(e=>e.kind==='arm')
    ? events.filter(e=>e.kind==='arm').map(e=>({t:e.t,armed:Boolean(e.value)}))
    : events.filter(e=>e.kind==='event'&&(e.value===10||e.value===11)).map(e=>({t:e.t,armed:e.value===10}));
  const modes=events.filter(e=>e.kind==='mode');
  const surface=events.filter(e=>e.kind==='takeoff'||(e.kind==='event'&&e.value===18));
  let armingState,modeIndex=0,surfaceIndex=0,mode=null,previousEnd=0;
  const bands=[],markers=[];
  const marker=(kind,t)=>markers.push({kind,t,...MARKERS[kind]});
  const append=(a,b,style,phase)=>{
    if(b<=a)return;
    const last=bands.at(-1);
    if(last?.id===style.id&&last.phase===phase&&last.end===a)last.end=b;
    else bands.push({...style,phase,start:a,end:b});
  };
  function addPhase(start,end,phase) {
    if(end<=start)return;
    while(modeIndex<modes.length&&modes[modeIndex].t<=start)mode=modes[modeIndex++].value;
    if(phase!=='air'&&phase!=='armed') {append(start,end,STATES[phase],phase);return;}
    let cursor=start;
    while(modeIndex<modes.length&&modes[modeIndex].t<end) {
      const e=modes[modeIndex++];
      append(cursor,e.t,mode==null?STATES[phase]:flightModeStyle(mode),phase);
      cursor=e.t;
      mode=e.value;
    }
    append(cursor,end,mode==null?STATES[phase]:flightModeStyle(mode),phase);
  }

  function addGroundGap(start,end) {
    const firstDisarm=arming[0]?.armed===false?arming[0].t:0;
    const unknownEnd=Math.min(firstDisarm,end);
    if(unknownEnd>start)addPhase(start,unknownEnd,'unknown');
    addPhase(Math.max(start,unknownEnd),end,arming.length?'locked':'unknown');
  }
  for(const e of arming) {
    if(armingState===e.armed)continue;
    marker(e.armed?'arm':'disarm',e.t);
    armingState=e.armed;
  }
  for(const flight of flights) {
    const {start,end}=flight;
    addGroundGap(previousEnd,start);
    while(surfaceIndex<surface.length&&surface[surfaceIndex].t<start)surfaceIndex++;
    let cursor=start,phase=flight.takeoff==null?'armed':'ground';
    while(surfaceIndex<surface.length&&surface[surfaceIndex].t<=end) {
      const e=surface[surfaceIndex++];
      if(e.kind==='takeoff'&&phase!=='air') {
        addPhase(cursor,e.t,phase);
        marker('takeoff',e.t);
        cursor=e.t;
        phase='air';
      } else if(e.kind==='event'&&phase==='air'&&e.t<end-.05) {
        // On some firmware, disarming emits LAND_COMPLETE immediately.
        // A landing marker represents a distinct interval before disarm.
        addPhase(cursor,e.t,phase);
        marker('land',e.t);
        cursor=e.t;
        phase='landed';
      }
    }
    addPhase(cursor,end,phase);
    previousEnd=end;
  }
  addGroundGap(previousEnd,duration);
  markers.sort((a,b)=>a.t-b.t);
  const legend=[...new Map(bands.map(({id,label,color})=>[id,{id,label,color}])).values()];
  return {bands,markers,legend};
}

export function stateAt(bands,time) {
  let lo=0,hi=bands.length;
  while(lo<hi){
    const mid=(lo+hi)>>>1;
    if(bands[mid].end<=time)lo=mid+1;
    else hi=mid;
  }
  return bands[lo]??bands.at(-1);
}

export function stateDescription(band) {
  if(band.phase==='armed'&&band.id.startsWith('mode-'))return '已解锁 · '+band.label;
  return band.label;
}
