import assert from 'node:assert/strict';
import test from 'node:test';
import {attitudeTransform,craftConfig,sampleAt} from '../src/replay/craft-data.js';
import {indexLog,readSampleWindow} from '../src/dataflash/parser.js';
import {demoFile} from '../src/dataflash/demo.js';
import {mapMotorSignal,motorChannels,PRESETS} from '../src/replay/signals.js';

test('motor positions and traces both follow remapped ArduPilot outputs',async()=>{
  const {meta}=await indexLog(demoFile());
  const params=[35,36,33,34].map((value,i)=>({name:`SERVO${i+1}_FUNCTION`,value}));
  const outputs=motorChannels(params);
  const {motors}=craftConfig({...meta,params},outputs);
  assert.deepEqual(motors.map(m=>[m.position,m.output]),[['右前',3],['左后',4],['左前',1],['右后',2]]);
  const graph=PRESETS.overview.rows.find(row=>row.note==='MOTOR RPM');
  assert.deepEqual(graph.series.map(s=>mapMotorSignal(s,outputs).instance),[2,3,0,1]);
});

test('craft attitude signs match ArduPilot conventions',()=>{
  assert.ok(attitudeTransform(25,0,0)([1,0,0])[1]<0);
  assert.ok(attitudeTransform(0,25,0)([0,0,-1])[1]>0);
  assert.ok(attitudeTransform(0,0,90)([0,0,-1])[0]>.99);
  const v=attitudeTransform(25,35,65)([.3,.4,.5]);
  assert.ok(Math.abs(Math.hypot(...v)-Math.hypot(.3,.4,.5))<1e-12);
});

test('attitude uses shortest interpolation and RPM uses the latest available sample',()=>{
  const yaw=Float64Array.of(1,359,1.25,1);
  assert.equal(sampleAt(yaw,1.125,true),360);
  const rpm=Float64Array.of(1,0,1.25,24100);
  assert.equal(sampleAt(rpm,1.125),0);
  assert.equal(sampleAt(rpm,.9),undefined);
  assert.equal(sampleAt(rpm,1.7),undefined);
});

test('local craft playback reads original series and moves across the log',async()=>{
  const log=await indexLog(demoFile());
  const {series}=craftConfig(log.meta);
  const points=Object.fromEntries((await readSampleWindow(log,series,25,36)).map(s=>[s.id,s.points]));
  assert.equal(Object.keys(points).length,7);
  assert.notEqual(sampleAt(points.M1,28),sampleAt(points.M1,33));
  assert.notEqual(sampleAt(points.Yaw,28,true),sampleAt(points.Yaw,33,true));
});
