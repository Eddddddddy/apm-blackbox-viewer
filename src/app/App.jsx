import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {
  Activity, AudioLines, ChevronDown, ChevronRight, CircleHelp, Crosshair, Download, FileText,
  FolderOpen, Gauge, ListFilter, LockKeyhole, Maximize, Minus, Pause, Play, Plus, ScanLine, Search,
  SlidersHorizontal, StepBack, StepForward, TriangleAlert, X
} from 'lucide-react';
import {Plot,ModeStrip,PADDING,clamp,fmt,nearest,timeLabel} from '../components/charts.jsx';
import {available,COLORS,customSignals,gyroSignals,mapMotorSignal,motorChannels,PRESETS} from '../replay/signals.js';
import {craftConfig,sampleAt} from '../replay/craft-data.js';
import {frameSignal,frameStep} from '../replay/frame-navigation.js';
import {CraftPreview} from '../components/CraftPreview.jsx';
import {normalizedStick,rcStickConfig,stickChart,stickPercent} from '../replay/rc-sticks.js';
import {StickPreview} from '../components/StickPreview.jsx';
import {TimelineTrack} from '../components/TimelineTrack.jsx';
import {REPLAY_CHUNK,useLog} from './use-log.js';

const TABS=[
  ['overview','飞行概览',Activity],['tuning','姿态与 PID',SlidersHorizontal],['navigation','视觉与定位',Crosshair],
  ['power','动力与振动',Gauge],['spectrum','频谱',AudioLines],['events','事件',ListFilter],['params','参数',FileText]
];
const FRAME_STEPS=[1,5,10,25,50,100,400];
const EMPTY=[];
const EMPTY_OVERVIEW={overview:EMPTY,flights:EMPTY,catalog:EMPTY,events:EMPTY,params:EMPTY};
const sizeLabel=n=>n>=1e9?`${(n/1e9).toFixed(2)} GB`:`${(n/1e6).toFixed(1)} MB`;
const shortTime=t=>timeLabel(t,1);

function IconButton({icon:Icon,label,onClick,disabled=false,className=''}) {
  return <button type="button" className={'icon-button '+className} onClick={onClick} disabled={disabled} title={label} aria-label={label}><Icon size={16}/></button>;
}

function Sidebar({events,scope,cursor,seek,duration,craft,replayWindow,craftPending}) {
  const relevant=useMemo(()=>events.filter(e=>e.t>=scope[0]&&e.t<=scope[1]&&['arm','mode','takeoff','error'].includes(e.kind)),[events,scope]);
  const shown=relevant.slice(0,80);
  const mode=events.findLast(e=>e.kind==='mode'&&e.t<=cursor);
  const arm=events.findLast(e=>e.kind==='arm'&&e.t<=cursor);
  const last=shown.findLastIndex(e=>e.t<=cursor);
  return <aside className="sidebar">
    <section className="side-section cursor-box">
      <div className="side-heading"><Crosshair size={15}/><h2>播放头</h2></div>
      <div className="cursor-time">{timeLabel(cursor,4)}</div>
      <div className="cursor-description">日志时间 <span>／</span> {timeLabel(duration,1)}</div>
      <div className="readout"><span>飞行模式</span><strong>{mode?.name??'—'}</strong></div>
      <div className="readout"><span>电机状态</span><strong className={arm?.value?'armed':''}>{arm?arm.value?'已解锁':'已上锁':'—'}</strong></div>
    </section>
    <CraftPreview config={craft} points={replayWindow?.points} cursor={cursor} pending={craftPending}/>
    <section className="side-section flight-events">
      <div className="side-heading"><ListFilter size={15}/><h2>飞行事件</h2><span className="count">{relevant.length}</span></div>
      <div className="side-events">
        {shown.map((e,i)=><button type="button" key={i} onClick={()=>seek(e.t)} className={'side-event '+(i===last?'current':'')}>
          <span className={'event-dot event-'+e.kind}></span><span>{e.name}</span><time>{shortTime(e.t)}</time><ChevronRight size={13}/>
        </button>)}
        {!shown.length&&<p className="muted small">此时间段没有飞行事件。</p>}
      </div>
    </section>
    <details className="side-section shortcuts">
      <summary className="side-heading"><CircleHelp size={15}/><span>快捷键</span><ChevronDown size={13}/></summary>
      <div><span>播放 / 暂停</span><kbd>Space</kbd></div>
      <div><span>前进 / 后退</span><kbd>← / →</kbd></div>
      <div><span>适合视图</span><kbd>F</kbd></div>
      <div><span>频谱</span><kbd>A</kbd></div>
    </details>
  </aside>;
}

function Playback({meta,scope,domain,cursor,playing,speed,setSpeed,toggle,seek,goToFlight,clock,stepSize,setStepSize,step}) {
  return <section className="playback" aria-label="日志播放">
    <div className="player-controls">
      <div className="transport">
        <IconButton icon={StepBack} label={`后退 ${stepSize} 帧`} onClick={()=>step(-1)} disabled={!clock}/>
        <IconButton icon={playing?Pause:Play} label={playing?'暂停':'播放'} onClick={toggle} className="play-button"/>
        <IconButton icon={StepForward} label={`前进 ${stepSize} 帧`} onClick={()=>step(1)} disabled={!clock}/>
        <label className="select-wrap step-select" title={clock?`按 ${clock.type} 的记录时间步进`:'此日志没有可逐帧步进的时间序列'}>
          <span>步长</span><select aria-label="步进帧数" value={stepSize} disabled={!clock} onChange={e=>setStepSize(Number(e.target.value))}>
            {FRAME_STEPS.map(count=><option key={count} value={count}>{count} 帧</option>)}
          </select><ChevronDown size={14}/>
        </label>
        <span className="player-time">{timeLabel(cursor,4)} <span>/ {timeLabel(meta.duration,1)}</span></span>
      </div>
      <div className="transport-end">
        <label className="select-wrap rate-select"><select aria-label="播放速度" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>
          {[.25,.5,1,2,4].map(rate=><option key={rate} value={rate}>{rate}×</option>)}
        </select><ChevronDown size={14}/></label>
      </div>
    </div>
    <TimelineTrack meta={meta} scope={scope} domain={domain} cursor={cursor} seek={seek} goToFlight={goToFlight}/>
    <div className="seek-row">
      <span>{timeLabel(scope[0],1)}</span>
      <input type="range" aria-label="播放进度" min={scope[0]} max={scope[1]} step="any" value={cursor} onChange={e=>seek(Number(e.target.value))}/>
      <span>{timeLabel(scope[1],1)}</span>
    </div>
  </section>;
}

function RecordTable({type,meta,scope,seek}) {
  const [query,setQuery]=useState(''),[page,setPage]=useState(0),[all,setAll]=useState(false);
  const isEvents=type==='events';
  const rows=(isEvents?meta.events:meta.params).filter(r=>{
    if(isEvents&&!all&&(r.t<scope[0]||r.t>scope[1])) return false;
    return (r.name+' '+(isEvents?r.kind:r.value)).toLowerCase().includes(query.trim().toLowerCase());
  });
  const max=Math.max(0,Math.ceil(rows.length/40)-1);
  const p=clamp(page,0,max);
  return <section className="table-card">
    <div className="table-tools">
      <h2>{isEvents?'事件记录':'日志参数'}</h2>
      <label className="search"><Search size={15}/><input value={query} placeholder={isEvents?'搜索事件':'搜索参数名'} onChange={e=>{setQuery(e.target.value);setPage(0);}} aria-label={isEvents?'搜索事件':'搜索参数'}/></label>
      {isEvents&&<label className="checkbox"><input type="checkbox" checked={all} onChange={e=>{setAll(e.target.checked);setPage(0);}}/>整份日志</label>}
    </div>
    <div className="table-scroll"><table>
      <thead><tr>{(isEvents?['时间','类型','内容']:['参数','记录值','默认值']).map(v=><th key={v}>{v}</th>)}</tr></thead>
      <tbody>{rows.slice(p*40,p*40+40).map((r,i)=>isEvents
        ?<tr key={i}><td><button type="button" className="text-button mono" onClick={()=>seek(r.t,true)}>{timeLabel(r.t,3)}</button></td><td>{r.kind}</td><td>{r.name}</td></tr>
        :<tr key={r.name}><td className="mono">{r.name}</td><td className="mono">{Number.isFinite(r.value)?Number(r.value.toPrecision(8)):'—'}</td><td className="mono">{Number.isFinite(r.default)?Number(r.default.toPrecision(8)):'—'}</td></tr>)}
      {!rows.length&&<tr><td colSpan="3" className="muted">没有匹配记录。</td></tr>}</tbody>
    </table></div>
    <div className="pagination"><span>{rows.length.toLocaleString()} 条</span><button type="button" className="button secondary" onClick={()=>setPage(p-1)} disabled={p===0}>上一页</button><button type="button" className="button secondary" onClick={()=>setPage(p+1)} disabled={p===max}>下一页</button></div>
  </section>;
}

function SignalPicker({catalog,selected,onChange,onClose}) {
  const [query,setQuery]=useState('');
  const matched=useMemo(()=>{
    const q=query.toLowerCase().trim();
    return customSignals(catalog).filter(s=>s.id.toLowerCase().includes(q));
  },[catalog,query]);
  const dialog=useRef(null);
  useEffect(()=>{dialog.current.showModal();},[]);
  return <dialog ref={dialog} className="signal-dialog" onCancel={e=>{e.preventDefault();onClose();}}>
    <div className="dialog-header"><div><h2>选择曲线信号</h2><p>{selected.length} / 12 条已选</p></div><IconButton icon={X} label="关闭" onClick={onClose}/></div>
    <label className="search"><Search size={16}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索字段，例如 ESC、VISP.Q" aria-label="搜索信号"/></label>
    <div className="selected-signals">{selected.map(s=><button key={s.id} className="chip" onClick={()=>onChange(selected.filter(x=>x.id!==s.id))}>{s.id}<X size={12}/></button>)}</div>
    <div className="signal-list">{matched.slice(0,180).map(s=>{
      const has=selected.some(v=>v.id===s.id);
      return <label key={s.id} className="signal-option"><input type="checkbox" checked={has} disabled={!has&&selected.length>=12} onChange={()=>onChange(has?selected.filter(v=>v.id!==s.id):[...selected,s])}/>
        <span>{s.id}</span><small>{s.unit||'—'}</small>
      </label>;
    })}{!matched.length&&<p className="muted">没有匹配的信号。</p>}</div>
    <div className="dialog-footer"><span>{matched.length} 个匹配字段{matched.length>180?' · 搜索可缩小范围':''}</span><button type="button" className="button primary" onClick={onClose}>完成</button></div>
  </dialog>;
}

function SpectrumPanel({meta,log,cursor,scope}) {
  const [axis,setAxis]=useState('Z'),[instance,setInstance]=useState(0),[seconds,setSeconds]=useState(8);
  const [frozen,setFrozen]=useState(null);
  const rawIds=meta.catalog.find(d=>d.name==='GYR')?.instances??EMPTY;
  const primaryCount=meta.catalog.find(d=>d.name==='IMU')?.instances.length??0;
  const paired=Boolean((meta.params.find(p=>p.name==='INS_RAW_LOG_OPT')?.value??0)&2);
  const inputIds=paired&&primaryCount?rawIds.filter(i=>i<primaryCount):rawIds;
  const {frequency,frequencyBusy}=log;
  const channels=useMemo(()=>gyroSignals(meta,axis,instance),[meta,axis,instance]);
  const go=()=>{
    if(!channels.length)return;
    const a=Math.max(scope[0],Math.min(cursor-seconds/2,scope[1]-seconds));
    const b=Math.min(scope[1],a+seconds);
    setFrozen({axis,channels});
    log.fft(channels,a,b);
  };
  useEffect(()=>{go();},[meta,scope,axis,instance,seconds]);
  const points=useMemo(()=>Object.fromEntries((frequency?.series??[]).map(s=>[s.id,s.points])),[frequency]);
  const domain=useMemo(()=>[0,frequency?.sampleRate/2||1],[frequency]);
  const row=useMemo(()=>({title:'陀螺仪功率谱密度',series:frozen?.channels??channels,markers:frequency?.notches}),[frozen,channels,frequency]);
  return <section className="spectrum-panel">
    <div className="table-tools"><h2>陀螺仪频谱</h2><div className="spectrum-filters">
      <label>实例 <select aria-label="陀螺实例" value={instance} onChange={e=>setInstance(Number(e.target.value))}>{inputIds.length?inputIds.map(i=><option key={i}>{i}</option>):<option>0</option>}</select></label>
      <label>轴 <select aria-label="频谱轴" value={axis} onChange={e=>setAxis(e.target.value)}>{['X','Y','Z'].map(a=><option key={a}>{a}</option>)}</select></label>
      <label>窗口 <select aria-label="频谱窗口" value={seconds} onChange={e=>setSeconds(Number(e.target.value))}>{[2,4,8,12].map(a=><option key={a} value={a}>{a} 秒</option>)}</select></label>
      <button className="button secondary" onClick={go} disabled={!channels.length}><Crosshair size={15}/>分析播放头附近</button>
    </div></div>
    {rawIds.length===0?<div className="blank-state"><AudioLines size={30}/><p>这份日志没有 GYR 原始陀螺仪数据。</p></div>
      :frequency?<><div className="spectrum-details"><span>{shortTime(frequency.start)} – {shortTime(frequency.end)}</span><span>{Math.round(frequency.sampleRate)} Hz 采样</span><span>{(frequency.sampleRate/frequency.fftSize).toFixed(2)} Hz 分辨率</span>{frequency.notches.length>0&&<span title="频谱窗口中点附近记录的动态陷波中心频率">陷波 {frequency.notches.map(n=>Math.round(n)).join(' / ')} Hz</span>}</div>
        <div className="spectrum-legend"><span>dB re (rad/s)²/Hz</span>{row.series.filter(s=>points[s.id]).map(s=><span key={s.id}><i style={{background:s.color}}/>{s.label} · {s.id}</span>)}</div>
        <Plot row={row} points={points} domain={domain} axis="frequency" className="spectrum-canvas"/></>
      :<div className="blank-state"><AudioLines size={30}/><p>{frequencyBusy?'正在计算频谱…':'选择时间点后分析频谱。'}</p></div>}
    <p className="spectrum-help">以采样时间计算 Welch 功率谱。仅在日志同时记录滤波前、后样本时显示两条曲线。</p>
  </section>;
}

export function App() {
  const log=useLog(),meta=log.meta;
  const {duration=0,flights,catalog,events}=meta??EMPTY_OVERVIEW;
  const input=useRef(null),plotArea=useRef(null),drag=useRef(null),cursorRef=useRef(0),pendingFrame=useRef(null),dropDepth=useRef(0);
  const [tab,setTab]=useState('overview'),[selection,setSelection]=useState(-1),[domain,setDomain]=useState([0,1]);
  const [cursor,setCursor]=useState(0),[hover,setHover]=useState(null),[speed,setSpeed]=useState(1),[playing,setPlaying]=useState(false);
  const [custom,setCustom]=useState([]),[picker,setPicker]=useState(false),[dropping,setDropping]=useState(false);
  const [graphWidth,setGraphWidth]=useState(1000);
  const [stickMode,setStickMode]=useState(2),[stepSize,setStepSize]=useState(1);
  const [brush,setBrush]=useState(null);
  const selectedFlight=flights[selection];
  const scope=useMemo(()=>selectedFlight?[selectedFlight.start,selectedFlight.end]:[0,duration],[duration,selectedFlight]);
  const timelineTab=tab in PRESETS||tab==='custom';
  const motorMap=useMemo(()=>motorChannels(meta?.params??EMPTY),[meta]);
  const craft=useMemo(()=>meta?craftConfig(meta,motorMap):null,[meta,motorMap]);
  const rcSticks=useMemo(()=>meta?rcStickConfig(meta):null,[meta]);
  const stickRow=useMemo(()=>tab==='overview'?stickChart(rcSticks,stickMode):null,[tab,rcSticks,stickMode]);
  const timeAt=useCallback((event,view=domain)=>{
    const box=plotArea.current.getBoundingClientRect();
    return view[0]+clamp((event.clientX-box.left-PADDING.left)/(box.width-PADDING.left-PADDING.right),0,1)*(view[1]-view[0]);
  },[domain]);
  const jump=useCallback(t=>{pendingFrame.current=null;cursorRef.current=t;setCursor(t);},[]);
  const goToFlight=useCallback((id,t)=>{
    const f=flights[id], next=f?[f.start,f.end]:[0,duration];
    drag.current=null;
    setBrush(null);setSelection(id);setPlaying(false);setDomain(next);setHover(null);
    jump(clamp(t??f?.takeoff??next[0],...next));
  },[flights,duration,jump]);
  useEffect(()=>{
    setPlaying(false);
    setCustom([]);
    setPicker(false);
    setTab('overview');
    const actual=flights.findLastIndex(f=>Number.isFinite(f.takeoff));
    goToFlight(actual>=0?actual:flights.length-1);
  },[meta,goToFlight,flights]);
  const seek=useCallback((t,unscoped=false)=>{
    if(unscoped&&(t<scope[0]||t>scope[1])) {goToFlight(-1,t);return;}
    const end=clamp(t,...scope);
    jump(end);
    if(end<domain[0]||end>domain[1]){
      const span=domain[1]-domain[0];
      const at=clamp(end-span/2,scope[0],Math.max(scope[0],scope[1]-span));
      setDomain([at,at+span]);
    }
  },[scope,domain,goToFlight,jump]);
  function nextView(amount,anchor=(domain[0]+domain[1])/2) {
    const span=domain[1]-domain[0],total=scope[1]-scope[0];
    const width=clamp(span*amount,Math.min(.0001,total),total);
    const at=clamp(anchor-(anchor-domain[0])*width/span,scope[0],scope[1]-width);
    setDomain([at,at+width]);setHover(null);
  }
  const zoom=useCallback(nextView,[domain,scope]);
  const fit=useCallback(()=>{setDomain(scope);setHover(null);},[scope]);
  const toggle=useCallback(()=>{
    if(cursorRef.current>=scope[1]-.001) seek(scope[0]);
    setPlaying(on=>!on);
  },[scope,seek]);
  useEffect(()=>{
    if(!playing)return;
    let last=0,frame;
    const tick=(now)=>{
      if(last) {
        const next=cursorRef.current+(now-last)/1000*speed;
        if(next>=scope[1]) {seek(scope[1]);setPlaying(false);return;}
        seek(next);
      }
      last=now;frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[playing,speed,scope,seek]);
  const rows=useMemo(()=>{
    if(tab==='custom'){
      const grouped=Object.groupBy(custom.map((s,i)=>({...s,color:COLORS[i%COLORS.length]})),s=>s.unit||'无单位');
      return Object.entries(grouped).map(([unit,series])=>({title:unit==='无单位'?'自定义信号':unit,note:'CUSTOM',series}));
    }
    const preset=(PRESETS[tab]?.rows??EMPTY).map(row=>({...row,series:row.series.map(s=>mapMotorSignal(s,motorMap)).filter(s=>s&&available(s,catalog))}));
    if(stickRow)preset.splice(1,0,stickRow);
    return preset.filter(row=>row.series.length);
  },[tab,custom,catalog,motorMap,stickRow]);
  const signals=useMemo(()=>[...new Map(rows.flatMap(r=>r.series).map(s=>[s.id,s])).values()],[rows]);

  const clock=useMemo(()=>frameSignal(catalog),[catalog]);
  const replaySeries=useMemo(()=>{
    const byId=new Map(signals.map(({rcAxis,...signal})=>[signal.id,signal]));
    for(const signal of [...(craft?.series??EMPTY),...(rcSticks?.series??EMPTY),...(clock?[clock]:EMPTY)]) byId.set(signal.id,signal);
    return [...byId.values()];
  },[signals,craft,rcSticks,clock]);
  const replayKey=useMemo(()=>JSON.stringify(replaySeries.map(({id,type,field,instance})=>[id,type,field,instance]).sort()),[replaySeries]);
  const replayBucket=Math.floor((clamp(cursor,0,duration)+.75)/REPLAY_CHUNK)*REPLAY_CHUNK;
  const replayWindow=log.replayWindows.find(w=>cursor>=w.start&&cursor<=w.end);
  const legendWindow=log.replayWindows.find(w=>w.key===replayKey&&cursor>=w.start&&cursor<=w.end);
  const replayPending=Boolean(!replayWindow&&!log.replayError);
  useEffect(()=>{
    if(replaySeries.length&&!log.replayWindows.some(w=>w.key===replayKey&&w.bucket===replayBucket)) {
      log.replay(replaySeries,replayKey,replayBucket,duration);
    }
  },[replaySeries,replayKey,replayBucket,duration]);

  const step=direction=>{
    if(!clock)return;
    setPlaying(false);
    setHover(null);
    const from=cursorRef.current;
    const pending=pendingFrame.current;
    const count=pending?.direction===direction?pending.count+stepSize:stepSize;
    const buffer=log.replayWindows.find(w=>from>=w.start&&from<=w.end&&w.points[clock.id]);
    const target=frameStep(buffer?.points[clock.id],from,direction,count,scope);
    const coversEdge=buffer&&(direction<0?buffer.start<=scope[0]:buffer.end>=scope[1]);
    if(target.count===count||coversEdge){
      pendingFrame.current=null;
      if(target.time!=null)seek(target.time);
      return;
    }
    pendingFrame.current={id:log.findFrame(clock,from,direction,count,scope),direction,count};
  };
  useEffect(()=>{
    if(!log.frameResult||log.frameResult.id!==pendingFrame.current?.id)return;
    pendingFrame.current=null;
    if(log.frameResult.target!=null)seek(log.frameResult.target);
  },[log.frameResult,seek]);
  useEffect(()=>{
    const key=e=>{
      if(picker||e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey
        ||e.target.closest?.('select,textarea,dialog,[contenteditable],input:not([type="range"])'))return;
      if(meta&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
        e.preventDefault();
        step(e.key==='ArrowLeft'?-1:1);
        return;
      }
      if(e.target.closest?.('button,input')||(e.repeat&&e.code==='Space'))return;
      if(e.key.toLowerCase()==='o'){input.current.click();return;}
      if(!meta)return;
      if(e.code==='Space'){e.preventDefault();toggle();}
      if(e.key==='+'||e.key==='=')zoom(.66);
      if(e.key==='-')zoom(1.5);
      if(e.key.toLowerCase()==='f')fit();
      if(e.key.toLowerCase()==='a')setTab(x=>x==='spectrum'?'overview':'spectrum');
    };
    window.addEventListener('keydown',key);
    return()=>window.removeEventListener('keydown',key);
  });

  useEffect(()=>{
    const node=plotArea.current;
    if(!node)return;
    const observer=new ResizeObserver(([entry])=>setGraphWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return()=>observer.disconnect();
  },[timelineTab,meta]);
  useEffect(()=>{
    if(!meta||!signals.length||domain[1]<=domain[0])return;
    const h=setTimeout(()=>log.chart(signals,...domain,graphWidth),60);
    return()=>clearTimeout(h);
  },[meta,signals,domain,graphWidth]);
  useEffect(()=>{
    const el=plotArea.current;
    if(!el)return;
    const wheel=e=>{
      const viewport=el.parentElement;
      const scrollable=viewport.scrollHeight>viewport.clientHeight+1;
      if(scrollable&&(e.altKey||e.clientX<el.getBoundingClientRect().left+PADDING.left))return;
      if(!e.shiftKey && !e.ctrlKey && Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
      e.preventDefault();
      if(e.shiftKey) {
        const w=domain[1]-domain[0],a=clamp(domain[0]+(e.deltaX||e.deltaY)*w/700,scope[0],scope[1]-w);
        setDomain([a,a+w]);
      } else zoom(Math.exp(clamp(e.deltaY,-160,160)*.003),timeAt(e));
    };
    el.addEventListener('wheel',wheel,{passive:false});
    return()=>el.removeEventListener('wheel',wheel);
  },[timelineTab,meta,domain,zoom,scope,timeAt]);

  const pointerDown=e=>{
    if(e.button!==0||e.target.closest('button')||drag.current)return;
    e.currentTarget.parentElement.focus({preventScroll:true});
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current={id:e.pointerId,x:e.clientX,domain,pan:e.shiftKey,anchor:timeAt(e),moved:false};
    setHover(null);
  };
  const pointerMove=e=>{
    const current=drag.current;
    if(!current){setHover(timeAt(e));return;}
    if(current.id!==e.pointerId)return;
    const d=e.clientX-current.x;
    if(Math.abs(d)<4&&!current.moved)return;
    current.moved=true;
    if(!current.pan){
      const t=timeAt(e,current.domain);
      setBrush([Math.min(t,current.anchor),Math.max(t,current.anchor)]);
      return;
    }
    const w=current.domain[1]-current.domain[0],p=plotArea.current.clientWidth-PADDING.left-PADDING.right;
    const a=clamp(current.domain[0]-d*w/p,scope[0],scope[1]-w);
    setDomain([a,a+w]);
  };
  const clearDrag=e=>{
    if(e.pointerId!==drag.current?.id)return;
    drag.current=null;
    setBrush(null);
  };
  const pointerUp=e=>{
    if(e.pointerId!==drag.current?.id)return;
    const {moved,pan,anchor,domain:view}=drag.current;
    clearDrag(e);
    if(!moved){seek(timeAt(e));return;}
    if(pan)return;
    const t=timeAt(e,view),start=Math.min(t,anchor),end=Math.max(t,anchor);
    if(end<=start)return;
    setPlaying(false);
    setDomain([start,end]);
    if(cursorRef.current<start||cursorRef.current>end)jump(start);
  };
  const openFiles=files=>{if(files?.[0])log.open(files[0]);};
  const ratio=t=>(t-domain[0])/(domain[1]-domain[0]);
  function legendValue(signal) {
    const points=legendWindow?.points[signal.id];
    if(hover!=null||!points?.length) {
      return {value:nearest(log.points[signal.id],hover??cursor),source:'最近绘制样本'};
    }
    const attitude=signal.type===craft?.attitudeType&&['Roll','Pitch','Yaw'].includes(signal.field);
    const sample=sampleAt(points,cursor,attitude,(attitude||signal.rcAxis)?0.35:Infinity);
    return {
      value:signal.rcAxis?normalizedStick(signal.rcAxis,sample)?.percent:sample,
      source:'播放头样本'
    };
  }
  const plotOverlay=t=>({left:`calc(${PADDING.left}px + (100% - ${PADDING.left+PADDING.right}px) * ${ratio(t)})`});
  const viewDigits=clamp(Math.ceil(-Math.log10(domain[1]-domain[0]))+1,1,6);
  const allTimesValid=Number.isFinite(duration)&&duration>0&&domain[1]>domain[0];

  return <div className="app" onDragEnter={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dropDepth.current++;setDropping(true);}}}
    onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}}
    onDragLeave={()=>{if(--dropDepth.current<=0){dropDepth.current=0;setDropping(false);}}}
    onDrop={e=>{e.preventDefault();dropDepth.current=0;setDropping(false);openFiles(e.dataTransfer.files);}}>
    <header className="masthead">
      <div className="brand"><span className="brand-icon"><Activity size={22} strokeWidth={2.4}/></span><div><h1>APM 黑匣子查看器</h1><p>ArduPilot DataFlash</p></div></div>
      <div className="mast-actions"><span className="privacy"><LockKeyhole size={14}/>浏览器本地解析</span><button className="button primary" onClick={()=>input.current.click()}><FolderOpen size={17}/>打开日志</button></div>
      <input ref={input} type="file" accept=".bin,application/octet-stream" className="hidden-file" aria-label="选择 ArduPilot 日志" onChange={e=>{openFiles(e.target.files);e.target.value='';}}/>
    </header>
    <main className="workspace">
      <section className="filebar">
        <div className="file-info"><span className="file-icon"><FileText size={18}/></span><div>
          <div className="filename">{log.file?.name??'黑匣子日志'} {log.file?.demo&&<span className="demo-label">演示数据</span>}</div>
          <p>{log.file?sizeLabel(log.file.size):'ArduPilot DataFlash BIN'}{meta&&<><span>·</span>{meta.firmware||'DataFlash'}<span>·</span>{flights.length} 个解锁区间</>}</p>
        </div></div>
        {meta&&<label className="flight-picker"><span>时间范围</span><span className="select-wrap"><select aria-label="选择飞行区间" value={selection} onChange={e=>goToFlight(Number(e.target.value))}>
          <option value={-1}>整份日志 · {shortTime(duration)}</option>
          {flights.map((f,i)=><option key={i} value={i}>{f.takeoff!=null?'飞行':'解锁区间'} {i+1} · {shortTime(f.end-(f.takeoff??f.start))}{f.unfinished?'（未上锁）':''}</option>)}
        </select><ChevronDown size={16}/></span></label>}
      </section>
      {log.error&&<div className="error-banner" role="alert"><TriangleAlert size={17}/><span>{log.error}</span><IconButton icon={X} label="关闭错误" onClick={log.clear}/></div>}
      {!meta&&<section className="blank-state empty-card">
        <ScanLine size={42}/>
        <h2>{log.progress!=null?'正在读取 DataFlash 日志':'打开一份黑匣子日志'}</h2>
        {log.progress!=null?<><progress value={log.progress} max={1}/><p>{Math.round(log.progress*100)}%</p></>:<><p>将飞控 TF 卡中的 .BIN 文件拖到这里。</p><button className="button primary" onClick={()=>input.current.click()}><FolderOpen size={17}/>选择日志</button></>}
      </section>}
      {meta&&allTimesValid&&<>
        <div className="analysis">
          <div className="analysis-main">
          <section className="main-panel">
            <nav className="tabs" aria-label="分析工作区">
              {TABS.map(([id,title,Icon])=><button key={id} type="button" className={tab===id?'tab active':'tab'} aria-pressed={tab===id} onClick={()=>{setTab(id);setHover(null);}}><Icon size={15}/>{title}</button>)}
              {custom.length>0&&<button type="button" className={tab==='custom'?'tab active':'tab'} aria-pressed={tab==='custom'} onClick={()=>setTab('custom')}><ListFilter size={15}/>自定义</button>}
            </nav>
            {timelineTab&&<>
              <div className="plot-toolbar"><div className="view-readout"><span className="view-name">{PRESETS[tab]?.name??'自定义'}</span><span className="range-label">{timeLabel(domain[0],viewDigits)} – {timeLabel(domain[1],viewDigits)}</span>
                {log.chartBusy&&<span className="loading-dot" role="status" aria-label="正在更新数据"/>}</div>
                <div className="graph-actions">
                  <IconButton icon={Minus} label="缩小时间轴" onClick={()=>zoom(1.5)}/><IconButton icon={Plus} label="放大时间轴" onClick={()=>zoom(.66)}/>
                  <IconButton icon={Maximize} label="适合视图" onClick={fit}/>
                  <span className="divider"></span>
                  <button className="button secondary compact" onClick={()=>setPicker(true)}><SlidersHorizontal size={15}/>信号</button>
                  <IconButton icon={Download} label={log.csvBusy?'正在导出':'导出当前曲线 CSV'} onClick={()=>log.csv(signals,...domain)} disabled={!signals.length||log.csvBusy}/>
                </div>
              </div>
              {rows.length>0?<div className="plot-scroll" tabIndex={0} aria-label="日志曲线区"><div className={'plot-area'+(stickRow?' has-stick-traces':'')} ref={plotArea} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
                onPointerLeave={()=>{if(!drag.current)setHover(null);}} onPointerCancel={clearDrag} onLostPointerCapture={clearDrag}>
                <div className="flight-stripe"><ModeStrip events={events} start={domain[0]} end={domain[1]}/></div>
                {rows.map((r,i)=><article key={r.title} className="graph-row">
                  <div className="graph-head"><h2>{r.title}<span>{r.note}</span></h2><div className="line-legend">
                    {r.series.map(s=>{
                      const {value,source}=legendValue(s);
                      const field=s.rcAxis?s.type+'.'+s.field:s.id;
                      return <span key={s.id} title={field+' · '+source}><i style={{background:s.color}}/>{s.label}<b>{s.rcAxis?stickPercent(s.rcAxis,value):fmt(value)}</b>{s.unit&&<em>{s.unit}</em>}</span>;
                    })}
                  </div></div>
                  <Plot row={r} points={log.points} domain={domain} axis={i===rows.length-1?'timeOnly':''}/>
                </article>)}
                {cursor>=domain[0]&&cursor<=domain[1]&&<span className="plot-head" style={plotOverlay(cursor)}/>}
                {hover!=null&&<span className="plot-hover" style={plotOverlay(hover)}><span>{timeLabel(hover,Math.max(2,viewDigits))}</span></span>}
                {brush&&brush[0]<brush[1]&&<span className="plot-selection" style={{...plotOverlay(brush[0]),width:`calc((100% - ${PADDING.left+PADDING.right}px) * ${ratio(brush[1])-ratio(brush[0])})`}}/>}
              </div></div>:<div className="blank-state"><Activity size={27}/><p>这份日志没有当前视图需要的信号。</p><button className="button secondary" onClick={()=>setPicker(true)}>选择其他信号</button></div>}
              <div className="plot-footer"><span>横向拖动框选 · Shift + 拖动平移 · 滚轮缩放</span>{meta.skipped>0&&<span title="解析时跳过无法识别的字节，可能来自断电时未写完的最后一条记录。">跳过 {meta.skipped.toLocaleString()} 字节</span>}</div>
            </>}
            {tab==='spectrum'&&<SpectrumPanel meta={meta} log={log} cursor={cursor} scope={scope}/>}
            {(tab==='events'||tab==='params')&&<RecordTable key={tab} type={tab} meta={meta} scope={scope} seek={seek}/>}
          </section>
          <StickPreview config={rcSticks} points={replayWindow?.points} cursor={cursor} pending={replayPending&&rcSticks.series.length>0} mode={stickMode} setMode={setStickMode}/>
          </div>
          <Sidebar events={events} scope={scope} cursor={cursor} seek={seek} duration={duration} craft={craft} replayWindow={replayWindow} craftPending={replayPending&&craft.series.length>0}/>
        </div>
        <Playback meta={meta} scope={scope} domain={domain} cursor={cursor} playing={playing} speed={speed} setSpeed={setSpeed} toggle={toggle} seek={seek} goToFlight={goToFlight}
          clock={clock} stepSize={stepSize} setStepSize={size=>{pendingFrame.current=null;setStepSize(size);}} step={step}/>
      </>}
    </main>
    {picker&&meta&&<SignalPicker catalog={catalog} selected={custom} onChange={setCustom} onClose={()=>{setPicker(false);if(custom.length)setTab('custom');}}/>}
    {dropping&&<div className="drop-overlay"><div><FolderOpen size={40}/><strong>松开以打开日志</strong><span>ArduPilot DataFlash · .BIN</span></div></div>}
  </div>;
}
