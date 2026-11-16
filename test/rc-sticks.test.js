import assert from 'node:assert/strict';
import test from 'node:test';
import {indexLog,readSampleWindow,chartData} from '../src/dataflash/parser.js';
import {demoFile} from '../src/dataflash/demo.js';
import {rcStickConfig,normalizedStick,readSticks,STICK_LAYOUTS,stickChart} from '../src/replay/rc-sticks.js';

const param=(name,value)=>({name,value});
const catalog=[
  {name:'RCIN',fields:['C1','C2','C3','C4'].map(name=>({name}))},
  {name:'RCI2',fields:[{name:'C16'}]}
];

test('uses log channel mapping and calibrated trim, including extended inputs',()=>{
  const config=rcStickConfig({catalog,params:[
    param('RCMAP_ROLL',16),param('RC16_MIN',990),param('RC16_TRIM',1530),param('RC16_MAX',2010),
    param('RC2_MIN',988),param('RC2_TRIM',1500),param('RC2_MAX',2011),param('RC2_REVERSED',1)
  ]});
  assert.deepEqual(config.axes.roll.signal,{id:'rc-roll',type:'RCI2',field:'C16'});
  assert.equal(normalizedStick(config.axes.roll,1530).position,0);
  assert.equal(normalizedStick(config.axes.roll,1770).position,.5);
  assert.equal(normalizedStick(config.axes.pitch,2011).position,1);
});

test('throttle covers full calibrated travel and invalid or stale PWM stays blank',()=>{
  const config=rcStickConfig({catalog,params:[param('RC3_REVERSED',1),param('RC3_TRIM',1000)]});
  assert.deepEqual(normalizedStick(config.axes.throttle,1000),{position:1,percent:100,pwm:1000});
  assert.deepEqual(normalizedStick(config.axes.throttle,1500),{position:-0,percent:50,pwm:1500});
  assert.deepEqual(normalizedStick(config.axes.throttle,2000),{position:-1,percent:0,pwm:2000});
  assert.equal(normalizedStick(config.axes.throttle,0),null);
  const points={'rc-throttle':Float64Array.of(1,1000,2,2000)};
  assert.equal(readSticks(config,points,1.1).throttle.pwm,1000);
  assert.equal(readSticks(config,points,1.8).throttle,null);
});

test('same logged samples drive both sticks across playhead changes',async()=>{
  const log=await indexLog(demoFile());
  const config=rcStickConfig(log.meta);
  const points=Object.fromEntries((await readSampleWindow(log,config.series,30,40)).map(s=>[s.id,s.points]));
  assert.deepEqual(STICK_LAYOUTS[2],[['yaw','throttle'],['roll','pitch']]);
  const a=readSticks(config,points,32);
  const b=readSticks(config,points,34);
  assert.ok(a.yaw&&a.throttle&&a.roll&&a.pitch);
  assert.notEqual(a.roll.pwm,b.roll.pwm);
  assert.notEqual(a.throttle.pwm,b.throttle.pwm);
});


test('default overview traces share stick calibration and follow the selected layout',async()=>{
  const log=await indexLog(demoFile());
  const config=rcStickConfig(log.meta);
  const mode2=stickChart(config,2);
  assert.deepEqual(mode2.series.map(s=>s.label),['左杆偏航','左杆油门','右杆横滚','右杆俯仰']);
  assert.deepEqual(stickChart(config,1).series.map(s=>s.label),['左杆偏航','左杆俯仰','右杆横滚','右杆油门']);
  assert.equal(stickChart({...config,series:[]},2),null);
  const [raw]=await readSampleWindow(log,[config.axes.pitch.signal],32,32.6);
  const [trace]=await chartData(log,[mode2.series.find(s=>s.id==='rc-pitch')],32,32.6,500);
  const time=raw.points[0];
  const traceAt=trace.points.indexOf(time);
  assert.ok(traceAt>=0);
  assert.equal(trace.points[traceAt+1],normalizedStick(config.axes.pitch,raw.points[1]).percent);
  assert.ok(raw.points[1]>1000);
});
