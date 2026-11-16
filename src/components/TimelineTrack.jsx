import React,{useMemo,useRef} from 'react';
import {clamp,Overview,timeLabel} from './charts.jsx';
import {buildFlightTimeline,stateAt,stateDescription} from '../replay/flight-timeline.js';

function markerLabel(marker) {
  return `${marker.label} ${timeLabel(marker.t,3)}`;
}

function rangeLabel(band) {
  const digits=band.end-band.start<.2?3:1;
  return `${stateDescription(band)} · ${timeLabel(band.start,digits)} – ${timeLabel(band.end,digits)}（${(band.end-band.start).toFixed(digits)} 秒）`;
}

export function TimelineTrack({meta,scope,domain,cursor,seek,goToFlight}) {
  const rail=useRef(null),dragging=useRef(false);
  const {bands,markers,legend}=useMemo(()=>buildFlightTimeline(meta),[meta]);
  const current=stateAt(bands,cursor);
  const percent=t=>t/meta.duration*100+'%';
  function jump(t, changeFlight) {
    if(changeFlight&&(t<scope[0]||t>scope[1]))goToFlight(meta.flights.findIndex(f=>t>=f.start&&t<=f.end),t);
    else seek(t);
  }
  function pointerTime(event) {
    const r=rail.current.getBoundingClientRect();
    return clamp((event.clientX-r.left-rail.current.clientLeft)/rail.current.clientWidth,0,1)*meta.duration;
  }
  return <>
    <div className="timeline-heading">
      <span>飞行状态</span>
      {current&&<span className="timeline-current" title={rangeLabel(current)}>
        <i style={{background:current.color}}/>{stateDescription(current)}
        <span className="timeline-current-span">{timeLabel(current.start,1)} – {timeLabel(current.end,1)}</span>
      </span>}
    </div>
    <div className="overview-wrap" ref={rail} onPointerDown={e=>{
      if(e.button!==0||e.target.closest('button'))return;
      dragging.current=true;
      e.currentTarget.setPointerCapture(e.pointerId);
      jump(pointerTime(e),true);
    }} onPointerMove={e=>{if(dragging.current)jump(pointerTime(e),false);}}
      onLostPointerCapture={()=>{dragging.current=false;}} onPointerUp={()=>{dragging.current=false;}}>
      <div className="timeline-bands" role="list" aria-label="飞行状态时间范围">
        {bands.map(band=><span key={band.start} className="timeline-band" role="listitem"
          aria-label={rangeLabel(band)} title={rangeLabel(band)}
          style={{left:percent(band.start),width:percent(band.end-band.start),background:band.color,color:band.ink}}>
          {(band.end-band.start)/meta.duration>=.06?band.label:''}
        </span>)}
      </div>
      <div className="timeline-throttle" title="油门输出"><Overview overview={meta.overview} duration={meta.duration}/></div>
      <span className="overview-window" style={{left:percent(domain[0]),width:percent(domain[1]-domain[0])}}></span>
      <span className="overview-head" style={{left:percent(cursor)}}></span>
      {markers.map(marker=><button key={marker.kind+'-'+marker.t} type="button" className={'timeline-marker marker-'+marker.kind}
        aria-label={markerLabel(marker)} title={markerLabel(marker)} style={{left:percent(marker.t),'--marker-color':marker.color}}
        onClick={()=>jump(marker.t,true)}><span/></button>)}
    </div>
    <div className="timeline-legend" aria-label="状态与事件图例">
      {legend.map(status=><span key={status.id}><i style={{background:status.color}}/>{status.label}</span>)}
      {markers.length>0&&<span className="timeline-marker-legend">
        {[...new Map(markers.map(m=>[m.kind,m])).values()].map(m=><span key={m.kind}><i className={'marker-'+m.kind} style={{background:m.color}}/>{m.label}</span>)}
      </span>}
    </div>
  </>;
}
