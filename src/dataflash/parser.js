import {normalizedStick} from '../replay/rc-sticks.js';
import {frameStep} from '../replay/frame-navigation.js';

// DataFlash record layouts are declared by FMT records in each file.
const WIDTH = { b:1, B:1, h:2, H:2, i:4, I:4, q:8, Q:8, f:4, d:8, g:2, c:2, C:2, e:4, E:4, L:4, M:1, n:4, N:16, Z:64, a:64 };
const SCALED = new Set(['c', 'C', 'e', 'E', 'L']);
const STRING = new Set(['n', 'N', 'Z', 'a']);
const PREFIX = new Map([[1,''],[0,''],[0.1,'d'],[0.01,'c'],[0.001,'m'],[1e-6,'µ'],[1e-9,'n']]);
const INSTANCE_FIELDS = { ATT:null, IMU:'I', GYR:'I', ACC:'I', ESC:'Instance', BAT:'Inst', BARO:'I', VIBE:'IMU', RFND:'Instance', FTN:'I', XKF1:'C', XKF2:'C', XKF3:'C', XKF4:'C' };
const CHUNK_SIZE = 8 * 1024 * 1024;
const INDEX_SIZE = 1024 * 1024;
const decoder = new TextDecoder();

export function layout(id, size, name, format, labels) {
  let offset = 3;
  const names = labels.split(',');
  const fields = Array.from(format, (code, i) => {
    const field = {name:names[i],offset,code,numeric:!STRING.has(code)};
    offset += WIDTH[code] ?? 0;
    return field;
  });
  const supported = offset === size && fields.length === names.length && fields.every(f => WIDTH[f.code]);
  const byName = new Map(supported ? fields.map(f => [f.name,f]) : []);
  return {id,size,name,fields:supported ? fields : [],byName,time:byName.get('TimeUS'),instance:byName.get(INSTANCE_FIELDS[name]),instances:new Set(),count:0};
}

function string(bytes, offset, length) {
  const end = offset + length;
  let cursor = offset;
  while (cursor < end && bytes[cursor] !== 0) cursor++;
  return decoder.decode(bytes.subarray(offset,cursor));
}

function half(bits) {
  const e = (bits >> 10) & 31;
  const m = bits & 1023;
  const sign = bits & 32768 ? -1 : 1;
  if (e === 31) return m ? NaN : sign * Infinity;
  return e === 0 ? sign * m * 2 ** -24 : sign * (1024 + m) * 2 ** (e - 25);
}

export function numeric(view, position, field) {
  const p = position + field.offset;
  switch (field.code) {
    case 'b': return view.getInt8(p);
    case 'B': case 'M': return view.getUint8(p);
    case 'h': return view.getInt16(p,true);
    case 'H': return view.getUint16(p,true);
    case 'i': return view.getInt32(p,true);
    case 'I': return view.getUint32(p,true);
    case 'q': return view.getInt32(p+4,true) * 4294967296 + view.getUint32(p,true);
    case 'Q': return view.getUint32(p+4,true) * 4294967296 + view.getUint32(p,true);
    case 'f': return view.getFloat32(p,true);
    case 'd': return view.getFloat64(p,true);
    case 'g': return half(view.getUint16(p,true));
    case 'c': return view.getInt16(p,true) / 100;
    case 'C': return view.getUint16(p,true) / 100;
    case 'e': return view.getInt32(p,true) / 100;
    case 'E': return view.getUint32(p,true) / 100;
    case 'L': return view.getInt32(p,true) / 1e7;
    default: return NaN;
  }
}

function readRecord(def, bytes, view, pos) {
  return Object.fromEntries(def.fields.map(f => [f.name,f.numeric ? numeric(view,pos,f) : string(bytes,pos+f.offset,WIDTH[f.code])]));
}

async function walk(file, start, end, definitions, visit, update, cancelled) {
  let skipped = 0;
  let offset = start;
  while (offset < end) {
    if (cancelled()) return skipped;
    const until = Math.min(end, offset + CHUNK_SIZE);
    const block = await file.slice(offset,Math.min(file.size,until+255)).arrayBuffer();
    if (cancelled()) return skipped;
    const bytes = new Uint8Array(block);
    const view = new DataView(block);
    let i = 0;
    const stop = until - offset;
    while (i < stop) {
      const def = bytes[i] === 0xa3 && bytes[i+1] === 0x95 ? definitions[bytes[i+2]] : null;
      if (!def || i+def.size > bytes.length || i+def.size+offset > end) {
        skipped++;
        i++;
        continue;
      }
      visit(def,bytes,view,i,offset+i);
      i += def.size;
    }
    offset += i;
    update?.(offset);
  }
  return skipped;
}

function validTime(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function displayUnit(unit, mult, field) {
  if (!unit || unit === '#') return '';
  // Packed formats already expose their scaled value, e.g. degrees from 'c'.
  if (SCALED.has(field.code)) return unit;
  return PREFIX.has(mult) ? PREFIX.get(mult) + unit : mult && mult !== 1 ? `${mult} ${unit}` : unit;
}

export async function indexLog(file, progress, cancelled = () => false) {
  const definitions = Array(256);
  definitions[128] = layout(128,89,'FMT','BBnNZ','Type,Length,Name,Format,Columns');
  const units = new Map(), multipliers = new Map(), fieldUnits = new Map();
  const blocks = [], events = [], parameters = new Map();
  let block = {start:0,end:0,lo:Infinity,hi:-Infinity};
  let first = Infinity, last = -Infinity, firmware = '', messages = 0;
  let overview = [], overviewStep = 0.2, overviewTime = -Infinity;
  const addEvent = (event) => {
    if (events.length < 50000 || ['arm','mode','takeoff'].includes(event.kind)) events.push(event);
  };
  const skipped = await walk(file,0,file.size,definitions,(def,bytes,view,p,offset) => {
    if (offset-block.start >= INDEX_SIZE) {
      block.end = offset;
      blocks.push(block);
      block = {start:offset,end:0,lo:Infinity,hi:-Infinity};
    }
    if (def.name === 'FMT') {
      const id = bytes[p+3], size = bytes[p+4];
      const name = string(bytes,p+5,4);
      if (id === 128 || size < 3 || !/^[A-Za-z0-9_]{1,4}$/.test(name)) return;
      const next = layout(id,size,name,string(bytes,p+9,16),string(bytes,p+25,64));
      const prior = definitions[id];
      if (prior?.name === name) {
        next.count = prior.count;
        next.instances = prior.instances;
      }
      const instance = fieldUnits.get(id)?.UnitIds?.indexOf('#') ?? -1;
      next.instance = next.fields[instance] ?? next.instance;
      definitions[id] = next;
      return;
    }
    def.count++;
    messages++;
    const stamp = def.time ? numeric(view,p,def.time) : NaN;
    if (validTime(stamp)) {
      if (stamp < block.lo) block.lo = stamp;
      if (stamp > block.hi) block.hi = stamp;
      if (stamp < first) first = stamp;
      if (stamp > last) last = stamp;
    }
    if (def.instance) def.instances.add(numeric(view,p,def.instance));
    switch (def.name) {
      case 'FMTU': {
        const info = readRecord(def,bytes,view,p);
        fieldUnits.set(info.FmtType,info);
        const instance = info.UnitIds?.indexOf('#') ?? -1;
        const mapped = definitions[info.FmtType];
        if (mapped?.fields[instance]) mapped.instance = mapped.fields[instance];
        break;
      }
      case 'UNIT': {
        const info = readRecord(def,bytes,view,p);
        units.set(String.fromCharCode(info.Id),info.Label);
        break;
      }
      case 'MULT': {
        const info = readRecord(def,bytes,view,p);
        multipliers.set(String.fromCharCode(info.Id),info.Mult);
        break;
      }
      case 'CTUN':
        if (validTime(stamp) && stamp / 1e6 >= overviewTime + overviewStep && def.byName.has('ThO')) {
          overviewTime = stamp / 1e6;
          overview.push([stamp,numeric(view,p,def.byName.get('ThO'))]);
          if (overview.length === 8192) {
            overview = overview.filter((_,i) => i%2 === 0);
            overviewStep *= 2;
          }
        }
        break;
      case 'VER': {
        const entry = readRecord(def,bytes,view,p);
        firmware ||= entry.FWS || '';
        break;
      }
      default:
        if (!validTime(stamp)) break;
        if (def.name === 'ARM') {
          const r = readRecord(def,bytes,view,p);
          addEvent({stamp,kind:'arm',value:r.ArmState,method:r.Method});
        } else if (def.name === 'MODE') {
          const r = readRecord(def,bytes,view,p);
          addEvent({stamp,kind:'mode',value:r.ModeNum ?? r.Mode,reason:r.Rsn});
        } else if (def.name === 'EV') {
          const {Id:value} = readRecord(def,bytes,view,p);
          addEvent({stamp,kind:value === 28 ? 'takeoff' : 'event',value});
        } else if (def.name === 'ERR') {
          const r = readRecord(def,bytes,view,p);
          addEvent({stamp,kind:'error',value:r.Subsys,code:r.ECode});
        } else if (def.name === 'MSG') {
          const {Message:label} = readRecord(def,bytes,view,p);
          if (label?.startsWith('Ardu')) firmware ||= label;
          if (label) addEvent({stamp,kind:'message',label});
        } else if (def.name === 'PARM') {
          const r = readRecord(def,bytes,view,p);
          if (r.Name) parameters.set(r.Name,{name:r.Name,value:r.Value,default:r.Default,stamp});
        }
    }
  }, offset => progress?.(offset/file.size),cancelled);
  if (cancelled()) return null;
  block.end = file.size;
  blocks.push(block);
  if (!Number.isFinite(first) || last <= first || !messages) throw new Error('未找到有效的 ArduPilot DataFlash 时间序列。请选择飞控记录的 .BIN 文件。');
  const byName = new Map(definitions.filter(Boolean).map(d => [d.name,d]));
  const catalog = definitions.filter(d => d?.time && d.count && d.fields.length).map(d => {
    const meta = fieldUnits.get(d.id);
    return {
      name:d.name,count:d.count,instance:d.instance?.name,
      instances:Array.from(d.instances).filter(Number.isFinite).sort((a,b)=>a-b),
      fields:d.fields.filter(f => f.numeric && f !== d.instance && !['TimeUS','SampleUS'].includes(f.name)).map(f=>({
        name:f.name,unit:displayUnit(units.get(meta?.UnitIds?.[d.fields.indexOf(f)]),multipliers.get(meta?.MultIds?.[d.fields.indexOf(f)]),f)
      }))
    };
  }).filter(d => d.fields.length).sort((a,b)=>a.name.localeCompare(b.name));
  const time = (stamp) => (stamp-first)/1e6;
  const duration = time(last);
  const sortedEvents = events.sort((a,b)=>a.stamp-b.stamp).map(e=>({...e,t:time(e.stamp)}));
  const rawArms = sortedEvents.filter(e=>e.kind==='arm');
  const arms = rawArms.length ? rawArms : sortedEvents.filter(e=>e.kind==='event' && [10,11].includes(e.value)).map(e=>({...e,value:Number(e.value===10)}));
  const takes = sortedEvents.filter(e=>e.kind==='takeoff');
  const flights = [];
  let current = null;
  for (const e of arms) {
    if (e.value && current === null) current = e.t;
    if (!e.value && current !== null && e.t>current) {
      flights.push({start:current,end:e.t});
      current = null;
    }
  }
  if (current !== null && duration>current) flights.push({start:current,end:duration,unfinished:true});
  for (const flight of flights) flight.takeoff = takes.find(e=>e.t>=flight.start && e.t<=flight.end)?.t;
  return {
    file,definitions,byName,blocks,first,
    meta:{duration,firmware,messages,skipped,catalog,flights,events:sortedEvents,params:Array.from(parameters.values()).sort((a,b)=>a.name.localeCompare(b.name)),overview:overview.map(([t,v])=>[time(t),v])}
  };
}

function spans(log, a, b) {
  const lo = a*1e6+log.first, hi = b*1e6+log.first;
  const ranges = [];
  for (const block of log.blocks) {
    if (block.hi < lo || block.lo > hi) continue;
    const last = ranges.at(-1);
    if (last?.end === block.start) last.end = block.end;
    else ranges.push({start:block.start,end:block.end});
  }
  return ranges;
}

function channelGroups(log, series) {
  const filters = Array(256);
  series.forEach((s,i)=>{
    const def = log.byName.get(s.type);
    const field = def?.byName.get(s.field);
    if (!field?.numeric || !def.time) return;
    (filters[def.id] ||= []).push({field,s,i});
  });
  return filters;
}

export async function visitSeries(log, series, a, b, visit, cancelled = () => false) {
  const filters = channelGroups(log,series);
  for (const range of spans(log,a,b)) {
    await walk(log.file,range.start,range.end,log.definitions,(def,_bytes,view,p)=>{
      const group = filters[def.id];
      if (!group) return;
      const t = (numeric(view,p,def.time)-log.first)/1e6;
      if (t < a || t > b) return;
      const inst = def.instance ? numeric(view,p,def.instance) : null;
      for (const o of group) {
        if (o.s.instance != null && o.s.instance !== inst) continue;
        const raw = numeric(view,p,o.field);
        const value = o.s.rcAxis ? normalizedStick(o.s.rcAxis,raw)?.percent : raw;
        if (Number.isFinite(value)) visit(o.i,t,value,def,view,p);
      }
    },null,cancelled);
    if (cancelled()) return;
  }
}

export async function chartData(log, series, a, b, pixels, cancelled) {
  const bins = Math.min(1800,Math.max(80,Math.round(pixels)));
  const buckets = series.map(()=>new Float64Array(bins*4).fill(NaN));
  const edges = series.map(()=>({before:null,after:null}));
  // Preserve both extrema and their original order in each horizontal bucket.
  await visitSeries(log,series,Math.max(0,a-0.8),Math.min(log.meta.duration,b+0.8),(i,t,v)=>{
    const bucket = buckets[i];
    if (t<a) {
      if (!edges[i].before || edges[i].before[0]<t) edges[i].before=[t,v];
      return;
    }
    if (t>b) {
      if (!edges[i].after || edges[i].after[0]>t) edges[i].after=[t,v];
      return;
    }
    const p = Math.min(bins-1,Math.floor((t-a)*bins/Math.max(1e-6,b-a)))*4;
    if (Number.isNaN(bucket[p]) || v < bucket[p+1]) { bucket[p]=t; bucket[p+1]=v; }
    if (Number.isNaN(bucket[p+2]) || v > bucket[p+3]) { bucket[p+2]=t; bucket[p+3]=v; }
  },cancelled);
  return series.map((s,i)=>{
    const points = [];
    if (edges[i].before) points.push(...edges[i].before);
    const data = buckets[i];
    for (let j=0;j<data.length;j+=4) {
      const t1=data[j],t2=data[j+2];
      if (Number.isNaN(t1)) continue;
      if (t1<t2) points.push(t1,data[j+1],t2,data[j+3]);
      else if (t1>t2) points.push(t2,data[j+3],t1,data[j+1]);
      else points.push(t1,data[j+1]);
    }
    if (edges[i].after) points.push(...edges[i].after);
    return {id:s.id,points:Float64Array.from(points)};
  });
}

export async function readSampleWindow(log, series, start, end, cancelled) {
  const samples=series.map(()=>[]);
  await visitSeries(log,series,start,end,(i,t,v)=>samples[i].push([t,v]),cancelled);
  return series.map((signal,i)=>{
    const ordered=samples[i].sort((a,b)=>a[0]-b[0]);
    const points=new Float64Array(ordered.length*2);
    ordered.forEach(([t,v],j)=>{points[j*2]=t;points[j*2+1]=v;});
    return {id:signal.id,points};
  });
}

export async function readFrameStep(log,signal,time,direction,count,scope,cancelled=()=>false) {
  const limit=scope[direction>0?1:0];
  let target=null,edge=time,width=2,remaining=count;
  while(!cancelled()&&remaining>0&&(limit-edge)*direction>0){
    const next=direction>0?Math.min(limit,edge+width):Math.max(limit,edge-width);
    const [record]=await readSampleWindow(log,[signal],Math.min(edge,next),Math.max(edge,next),cancelled);
    const step=frameStep(record.points,edge,direction,remaining,scope);
    if(step.count){
      target=step.time;
      remaining-=step.count;
    }
    edge=next;
    width=Math.min(30,width*2);
  }
  return target;
}
