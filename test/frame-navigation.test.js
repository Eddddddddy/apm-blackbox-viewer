import assert from 'node:assert/strict';
import test from 'node:test';
import {demoFile} from '../src/dataflash/demo.js';
import {indexLog,readFrameStep} from '../src/dataflash/parser.js';
import {frameSignal,frameStep} from '../src/replay/frame-navigation.js';

test('steps by distinct recorded timestamps in either direction within the flight',()=>{
  const points=Float64Array.of(10,0,10.002,0,10.002,0,10.005,0,10.012,0,10.023,0);
  const scope=[10.002,10.012];

  assert.deepEqual(frameStep(points,10.002,1,1,scope),{time:10.005,count:1});
  assert.deepEqual(frameStep(points,10.008,-1,2,scope),{time:10.002,count:2});
  assert.deepEqual(frameStep(points,10.004,1,5,scope),{time:10.012,count:2});
  assert.deepEqual(frameStep(points,10.012,1,1,scope),{time:null,count:0});
});

test('uses the log clock when a requested step extends beyond the replay window',async()=>{
  const log=await indexLog(demoFile());
  const clock=frameSignal(log.meta.catalog);
  const scope=[24,52];

  assert.equal(clock.type,'ANG');
  assert.equal(await readFrameStep(log,clock,25.901,1,1,scope),25.905);
  assert.equal(await readFrameStep(log,clock,25.9,1,500,scope),28.4);
  assert.equal(await readFrameStep(log,clock,28.4,-1,500,scope),25.9);
  assert.equal(await readFrameStep(log,clock,51.999,1,5,scope),52);
});
