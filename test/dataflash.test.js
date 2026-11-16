import assert from 'node:assert/strict';
import test from 'node:test';
import {indexLog,chartData,layout,numeric} from '../src/dataflash/parser.js';
import {demoFile} from '../src/dataflash/demo.js';
import {gyroSignals} from '../src/replay/signals.js';
import {spectrum} from '../src/dataflash/spectrum.js';

test('signed vision quality and scaled angular fields follow FMT',()=>{
  const def=layout(181,6,'TST','bc','Q,Roll');
  const data=new DataView(new ArrayBuffer(6));
  data.setInt8(3,-128);
  data.setInt16(4,-1234,true);
  assert.equal(numeric(data,0,def.byName.get('Q')),-128);
  assert.equal(numeric(data,0,def.byName.get('Roll')),-12.34);
});

test('finds arm/takeoff intervals, sensor instances and tail truncation',async()=>{
  const file=demoFile();
  const log=await indexLog(file.slice(0,file.size-3));
  assert.deepEqual(log.meta.flights,[
    {start:2,end:18,takeoff:3.3},
    {start:24,end:52,takeoff:25.9}
  ]);
  assert.ok(log.meta.skipped>0);
  assert.deepEqual(log.meta.catalog.find(x=>x.name==='ESC').instances,[0,1,2,3]);
  const results=await chartData(log,[{id:'m3',type:'ESC',field:'RPM',instance:2}],30,38,100);
  assert.ok(results[0].points.length>100);
  assert.ok(results[0].points[1]>24000);
});

test('rejects non-DataFlash input',async()=>{
  await assert.rejects(()=>indexLog(new Blob(['not a flight log'])),/DataFlash/);
});

test('retains real sample rates and distinguishes pre and post filter spectra',async()=>{
  const log=await indexLog(demoFile());
  const selected=gyroSignals(log.meta,'X',0);
  const result=await spectrum(log,selected,29,37,()=>false);
  assert.deepEqual(selected.map(s=>s.instance),[0,1]);
  assert.ok(Math.abs(result.sampleRate-500)<1);
  const index=Math.round(182*result.fftSize/result.sampleRate)*2;
  const [pre,post]=result.series;
  assert.ok(pre.points[index+1] - post.points[index+1] > 15);
  assert.ok(result.notches.length===4);
});
