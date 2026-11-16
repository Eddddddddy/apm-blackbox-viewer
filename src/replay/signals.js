export const COLORS=['#fa9251','#72d7e9','#ada0f6','#a8cf82','#e988ad','#edd17a','#7da7ef','#d7ded7'];

export const MODE_NAMES={0:'Stabilize',1:'Acro',2:'AltHold',3:'Auto',4:'Guided',5:'Loiter',6:'RTL',7:'Circle',9:'Land',11:'Drift',13:'Sport',14:'Flip',15:'AutoTune',16:'PosHold',17:'Brake',18:'Throw',19:'Avoid ADSB',20:'Guided NoGPS',21:'Smart RTL',22:'FlowHold',23:'Follow',24:'ZigZag',25:'SystemID',26:'AutoRotate',27:'Auto RTL',28:'Turtle'};
export const modeName=(value)=>MODE_NAMES[value]??`Mode ${value}`;
const EVENTS={10:'解锁',11:'上锁',15:'记录起点',17:'检测到可能降落',18:'检测到降落',25:'设置航向',28:'离地',56:'电机互锁关闭',57:'电机互锁开启',62:'EKF 主来源变化'};

export function eventName(event) {
  switch(event.kind) {
    case 'mode': return modeName(event.value);
    case 'arm': return event.value?'解锁':'上锁';
    case 'takeoff': return '离地';
    case 'error': return `错误 ${event.value} / ${event.code}`;
    case 'message': return event.label;
    default: return EVENTS[event.value]??`事件 #${event.value}`;
  }
}

const s=(type,field,label,unit,instance,color,dashed=false)=>({type,field,label,unit,instance,color,dashed,id:`${type}${instance==null?'':`[${instance}]`}.${field}`});
const motors=(type,field,unit)=>Array.from({length:4},(_,i)=>({...s(type,field,`电机 ${i+1}`,unit,i,COLORS[i]),motor:i}));

export function motorChannels(params) {
  const channels=Array(4).fill(null);
  let assigned=false;
  for (const {name,value} of params) {
    const match=/^SERVO(\d+)_FUNCTION$/.exec(name);
    if(!match || !Number.isInteger(value) || value<33 || value>36) continue;
    const output=Number(match[1])-1;
    const motor=value-33;
    channels[motor]=channels[motor]==null?output:Math.min(channels[motor],output);
    assigned=true;
  }
  return assigned?channels:[0,1,2,3];
}

export function mapMotorSignal(signal,channels) {
  if(signal.motor==null)return signal;
  const instance=channels[signal.motor];
  if(instance==null)return null;
  return {...signal,instance,id:`${signal.type}[${instance}].${signal.field}`};
}
const axes=(type,pairs,unit)=>pairs.map(([field,label],i)=>s(type,field,label,unit,null,COLORS[i]));
const output=(type,start=1)=>Array.from({length:4},(_,i)=>s(type,`C${i+start}`,`通道 ${i+start}`,'µs',null,COLORS[i]));

export const PRESETS={
  overview:{name:'飞行概览',rows:[
    {title:'姿态',note:'ATTITUDE',series:axes('ANG',[['Roll','横滚'],['Pitch','俯仰']],'°')},
    {title:'相对高度',note:'ALTITUDE',series:[s('CTUN','Alt','估计高度','m',null,COLORS[0]),s('CTUN','DAlt','目标高度','m',null,COLORS[1],true),s('RFND','Dist','下视测距','m',0,COLORS[2])]},
    {title:'电机转速',note:'MOTOR RPM',series:motors('ESC','RPM','rpm')},
    {title:'电池电压',note:'BATTERY',series:[s('BAT','Volt','电池电压','V',0,COLORS[0])]}
  ]},
  tuning:{name:'姿态与 PID',rows:[
    ...[['R','横滚'],['P','俯仰'],['Y','偏航']].map(([field,title])=>({title:`${title}角速度`,note:'RATE',series:[
      s('RATE',field,'实际','°/s',null,COLORS[0]),s('RATE',`${field}Des`,'目标','°/s',null,COLORS[1],true)
    ]})),
    ...[['PIDR','横滚'],['PIDP','俯仰'],['PIDY','偏航']].map(([type,title])=>({title:title+' PID 分量',note:type,series:axes(type,[['P','P'],['I','I'],['D','D']],'')})),
    {title:'电机输出',note:'OUTPUT',series:output('RCOU')}
  ]},
  navigation:{name:'视觉与定位',rows:[
    {title:'视觉质量',note:'VISUAL ODOMETRY',series:[s('VISP','Q','质量 Q','',null,COLORS[0])]},
    {title:'视觉拒收与重置',note:'VISP',series:axes('VISP',[['Ign','拒收标记'],['Rst','重置计数']],'')},
    {title:'视觉坐标',note:'VISP',series:axes('VISP',[['PX','北向'],['PY','东向'],['PZ','下向']],'m')},
    {title:'EKF 水平位置',note:'XKF1',series:[s('XKF1','PN','北向','m',0,COLORS[0]),s('XKF1','PE','东向','m',0,COLORS[1])]},
    {title:'高度来源',note:'ALTITUDE',series:[s('CTUN','Alt','估计高度','m',null,COLORS[0]),s('CTUN','BAlt','气压高度','m',null,COLORS[1]),s('RFND','Dist','下视测距','m',0,COLORS[2])]}
  ]},
  power:{name:'动力与振动',rows:[
    {title:'电机转速',note:'MOTOR RPM',series:motors('ESC','RPM','rpm')},
    {title:'动态陷波中心',note:'NOTCH',series:[1,2,3,4].map((n,i)=>s('FTN',`NF${n}`,`陷波 ${n}`,'Hz',0,COLORS[i]))},
    {title:'电池电压',note:'VOLTAGE',series:[s('BAT','Volt','电池电压','V',0,COLORS[0])]},
    {title:'电流',note:'CURRENT',series:[s('BAT','Curr','总电流','A',0,COLORS[4]),...motors('ESC','Curr','A')]},
    {title:'振动',note:'VIBE · IMU 0',series:['X','Y','Z'].map((axis,i)=>s('VIBE',`Vibe${axis}`,axis,'m/s²',0,COLORS[i]))}
  ]}
};

export function available(signal,catalog) {
  const entry=catalog.find(d=>d.name===signal.type);
  return entry?.fields.some(f=>f.name===signal.field) && (signal.instance==null||entry.instances.includes(signal.instance));
}

export function customSignals(catalog) {
  return catalog.flatMap(d=>(d.instances.length ? d.instances : [null]).flatMap(i=>d.fields.map(f=>{
    const signal=s(d.name,f.name,'',f.unit,i,'');
    return {...signal,label:signal.id};
  })));
}

export function gyroSignals(meta,axis,instance) {
  const params=new Map(meta.params.map(p=>[p.name,p.value]));
  const ids=meta.catalog.find(d=>d.name==='GYR')?.instances??[];
  const opts=params.get('INS_RAW_LOG_OPT')??0;
  const count=meta.catalog.find(d=>d.name==='IMU')?.instances.length??0;
  const paired=Boolean(opts&2) && count>0 && ids.includes(instance+count);
  return [
    s('GYR',`Gyr${axis}`,paired?'滤波前':opts&1?'滤波后':'陀螺仪','rad/s',instance,COLORS[0]),
    ...(paired?[s('GYR',`Gyr${axis}`,'滤波后','rad/s',instance+count,COLORS[1])]:[])
  ].filter(f=>available(f,meta.catalog));
}
