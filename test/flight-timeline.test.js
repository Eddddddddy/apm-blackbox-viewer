import assert from 'node:assert/strict';
import test from 'node:test';
import {buildFlightTimeline,flightModeStyle,stateAt,stateDescription} from '../src/replay/flight-timeline.js';

const arm=(t,value)=>({kind:'arm',t,value});
const mode=(t,value)=>({kind:'mode',t,value});
const takeoff=t=>({kind:'takeoff',t,value:28});
const landed=t=>({kind:'event',t,value:18});

test('mode switches split a flight at recorded times and keep ground phases separate',()=>{
  const timeline=buildFlightTimeline({duration:30,
    flights:[{start:2,end:25,takeoff:3}],
    events:[mode(0,0),arm(2,1),takeoff(3),mode(8,2),mode(13,5),landed(24),arm(25,0)]});
  assert.deepEqual(timeline.bands.map(b=>[b.start,b.end,b.id]),[
    [0,2,'locked'],[2,3,'ground'],[3,8,'mode-0'],[8,13,'mode-2'],[13,24,'mode-5'],[24,25,'landed'],[25,30,'locked']
  ]);
  assert.deepEqual(timeline.markers.map(m=>[m.t,m.kind]),[[2,'arm'],[3,'takeoff'],[24,'land'],[25,'disarm']]);
  assert.equal(stateAt(timeline.bands,13).label,'Loiter');
  assert.equal(stateAt(timeline.bands,30).id,'locked');
  assert.equal(timeline.bands[4].color,flightModeStyle(5).color);
});

test('disarm-generated LAND_COMPLETE does not mark a separate ground interval',()=>{
  const t=buildFlightTimeline({duration:15,flights:[{start:0,end:10,takeoff:1}],
    events:[arm(0,1),mode(0,5),takeoff(1),landed(9.999),arm(10,0)]});
  assert.equal(stateAt(t.bands,9.999).label,'Loiter');
  assert.equal(stateAt(t.bands,10).id,'locked');
  assert.deepEqual(t.markers.map(m=>m.kind),['arm','takeoff','disarm']);
});

test('legacy arm events and an armed interval without takeoff retain their documented status',()=>{
  const t=buildFlightTimeline({duration:15,flights:[{start:4,end:9}],events:[
    mode(0,0),{kind:'event',t:4,value:10},mode(5,2),{kind:'event',t:9,value:11}
  ]});
  assert.equal(stateDescription(stateAt(t.bands,6)),'已解锁 · AltHold');
  assert.deepEqual(t.markers.map(m=>m.kind),['arm','disarm']);
  assert.equal(buildFlightTimeline({duration:15,flights:[],events:[mode(0,0)]}).bands[0].id,'unknown');
});

test('a partial log begins with unknown arming state before the first recorded disarm',()=>{
  const t=buildFlightTimeline({duration:15,flights:[],events:[mode(0,5),arm(8,0)]});
  assert.deepEqual(t.bands.map(b=>[b.start,b.end,b.id]),[[0,8,'unknown'],[8,15,'locked']]);
});
