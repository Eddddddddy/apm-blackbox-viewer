import {available} from './signals.js';
import {sampleAt} from './craft-data.js';

const AXES=[
  {id:'roll',label:'横滚',channel:1,sign:1},
  {id:'pitch',label:'俯仰',channel:2,sign:-1},
  {id:'throttle',label:'油门',channel:3,sign:1},
  {id:'yaw',label:'偏航',channel:4,sign:1}
];

export const STICK_LAYOUTS={
  1:[['yaw','pitch'],['roll','throttle']],
  2:[['yaw','throttle'],['roll','pitch']],
  3:[['roll','pitch'],['yaw','throttle']],
  4:[['roll','throttle'],['yaw','pitch']]
};

export function rcStickConfig(meta) {
  const params=new Map(meta.params.map(p=>[p.name,p.value]));
  const axes=Object.fromEntries(AXES.map(descriptor=>{
    const {id}=descriptor;
    const channel=params.get('RCMAP_'+id.toUpperCase())??descriptor.channel;
    const prefix='RC'+channel+'_';
    const min=params.get(prefix+'MIN')??1000;
    const max=params.get(prefix+'MAX')??2000;
    const bounds=min<max?{min,max}:{min:1000,max:2000};
    const trim=params.get(prefix+'TRIM');
    const axis={
      ...descriptor,channel,...bounds,
      trim:trim>bounds.min&&trim<bounds.max?trim:(bounds.min+bounds.max)/2,
      direction:descriptor.sign*(params.get(prefix+'REVERSED')===1?-1:1)
    };
    const field='C'+channel;
    const signal={id:'rc-'+id,type:channel>14?'RCI2':'RCIN',field};
    return [id,{...axis,signal:available(signal,meta.catalog)?signal:null}];
  }));
  return {axes,series:Object.values(axes).flatMap(axis=>axis.signal?[axis.signal]:[])};
}

export function normalizedStick(axis,pwm) {
  if(!Number.isFinite(pwm)||pwm<600||pwm>2500)return null;
  const p=Math.min(axis.max,Math.max(axis.min,pwm));
  if(axis.id==='throttle'){
    const fraction=(p-axis.min)/(axis.max-axis.min);
    return {position:(fraction*2-1)*axis.direction,percent:(axis.direction<0?1-fraction:fraction)*100,pwm};
  }
  const delta=p-axis.trim,span=delta<0?axis.trim-axis.min:axis.max-axis.trim;
  const position=axis.direction*delta/span;
  return {position,percent:position*100,pwm};
}

export function readSticks(config,points,cursor) {
  return Object.fromEntries(Object.entries(config.axes).map(([id,axis])=>[
    id,normalizedStick(axis,sampleAt(points?.[axis.signal?.id],cursor))
  ]));
}

export function stickChart(config,mode) {
  if(!config?.series.length)return null;
  const colors=[['#fa9251','#edd17a'],['#72d7e9','#7da7ef']];
  const series=STICK_LAYOUTS[mode].flatMap((axes,side)=>axes.flatMap((id,i)=>{
    const axis=config.axes[id];
    if(!axis.signal)return [];
    const {min,max,trim,direction}=axis;
    return [{
      ...axis.signal,rcAxis:{id,min,max,trim,direction},unit:'%',
      label:(side===0?'左杆':'右杆')+axis.label,color:colors[side][i],dashed:i===1
    }];
  }));
  return {title:'遥控摇杆输入',note:'RC INPUT · %',series};
}

export function stickPercent(axis,value) {
  if(!Number.isFinite(value))return '—';
  const percent=Math.round(value);
  return (axis.id!=='throttle'&&percent>0?'+':'')+percent;
}
