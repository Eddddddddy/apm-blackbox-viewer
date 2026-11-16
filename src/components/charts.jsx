import React, {memo,useEffect,useRef} from 'react';
import {flightModeStyle} from '../replay/flight-timeline.js';

export const PADDING={left:56,right:15};
const GRID='#2a2d30', INK='#a0a6a8';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function timeLabel(t,digits=1) {
  if (!Number.isFinite(t)) return '–';
  const quant=Math.round(Math.abs(t)*10**digits);
  const scale=10**digits;
  const seconds=Math.floor(quant/scale);
  const fraction=digits?'.'+String(quant%scale).padStart(digits,'0'):'';
  const minutes=Math.floor(seconds/60);
  return (t<0?'−':'')+String(minutes).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')+fraction;
}

export function fmt(v) {
  if (!Number.isFinite(v)) return '—';
  const a=Math.abs(v);
  if (a>1000) return Math.round(v).toLocaleString('en-US');
  if (a<0.001 && a>0) return v.toExponential(1);
  return v.toFixed(a>=10?1:2);
}

function stepFor(span, ticks) {
  const size=Math.max(span/ticks,1e-9);
  const magnitude=10**Math.floor(Math.log10(size));
  return ([1,2,2.5,5,10].find(x=>x*magnitude>=size)??10)*magnitude;
}

function formatAxis(v, step) {
  if (Math.abs(v)>=10000) return Number((v/1000).toFixed(1))+'k';
  if (Math.abs(v)>0 && Math.abs(v)<0.001) return v.toExponential(0);
  return Number(v.toFixed(step<1?Math.ceil(-Math.log10(step))+1:0)).toString();
}

function draw(canvas, row, points, domain, axis) {
  const {width:w,height:h}=canvas.getBoundingClientRect();
  if (!w || !h) return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(w*dpr);
  canvas.height=Math.round(h*dpr);
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  const {left,right}=PADDING;
  const width=Math.max(1,w-left-right),top=8,bottom=h-(axis==='timeOnly'?21:14);
  const [a,b]=domain;
  const x=t=>left+(t-a)*width/(b-a);
  let min=Infinity,max=-Infinity;
  for (const signal of row.series) {
    const data=points[signal.id];
    if (!data?.length) continue;
    let localMin=Infinity,localMax=-Infinity;
    for (let i=0;i<data.length;i+=2) {
      if (data[i]<a || data[i]>b) continue;
      if (data[i+1]<localMin) localMin=data[i+1];
      if (data[i+1]>localMax) localMax=data[i+1];
    }
    if (!Number.isFinite(localMin)) continue;
    min=Math.min(min,localMin);
    max=Math.max(max,localMax);
  }
  const hasData=Number.isFinite(min)&&Number.isFinite(max);
  ctx.font='10px "IBM Plex Mono", ui-monospace, monospace';
  ctx.lineWidth=1;
  ctx.strokeStyle=GRID;
  ctx.fillStyle=INK;
  const xStep=stepFor(b-a,Math.max(3,Math.floor(width/115)));
  const tStart=Math.ceil(a/xStep-1e-8)*xStep;
  for(let t=tStart;t<=b+1e-8;t+=xStep) {
    const px=Math.round(x(t))+.5;
    ctx.beginPath(); ctx.moveTo(px,top); ctx.lineTo(px,bottom); ctx.stroke();
    if (axis) {
      ctx.textAlign=px<left+20?'left':px>left+width-20?'right':'center';
      const label=axis==='frequency'?`${Math.round(t)} Hz`:timeLabel(t,xStep<1?2:b-a<25?1:0);
      ctx.fillText(label,px,bottom+14);
    }
  }
  if (!hasData) {
    ctx.textAlign='center';
    ctx.font='12px system-ui, sans-serif';
    ctx.fillText('此时间段没有样本',left+width/2,(top+bottom)/2);
    return;
  }
  if (min===max) {
    const pad=Math.max(Math.abs(min)*.03,.1);
    min-=pad;max+=pad;
  } else {
    const pad=(max-min)*.08;
    min-=pad;max+=pad;
  }
  const y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  const dy=stepFor(max-min,Math.max(2,Math.floor((bottom-top)/25)));
  ctx.textAlign='right';
  for(let v=Math.ceil(min/dy)*dy;v<=max+1e-9;v+=dy) {
    const py=Math.round(y(v))+.5;
    ctx.beginPath(); ctx.moveTo(left,py); ctx.lineTo(left+width,py); ctx.stroke();
    ctx.fillText(formatAxis(v,dy),left-8,py+3);
  }
  ctx.save();
  ctx.beginPath();ctx.rect(left,top,width,bottom-top);ctx.clip();
  if (row.markers?.length) {
    ctx.setLineDash([3,4]);
    ctx.strokeStyle='#d5ad7575';
    for (const mark of row.markers) {
      const px=x(mark);
      ctx.beginPath();ctx.moveTo(px,top);ctx.lineTo(px,bottom);ctx.stroke();
    }
  }
  for (const signal of row.series) {
    const data=points[signal.id];
    if (!data?.length) continue;
    const gaps=[];
    for(let i=2;i<data.length&&gaps.length<120;i+=2) if(data[i]>data[i-2]) gaps.push(data[i]-data[i-2]);
    gaps.sort((a,b)=>a-b);
    const gap=Math.max((b-a)/width*5,(gaps[gaps.length>>1]??0)*5,.001);
    ctx.strokeStyle=signal.color;
    ctx.fillStyle=signal.color;
    ctx.lineWidth=signal.dashed?1.1:1.35;
    ctx.setLineDash(signal.dashed?[5,4]:[]);
    ctx.beginPath();
    for(let i=0;i<data.length;i+=2) {
      const px=x(data[i]), py=y(data[i+1]);
      if (i===0 || data[i]-data[i-2]>gap) ctx.moveTo(px,py);
      else ctx.lineTo(px,py);
    }
    ctx.stroke();
    if(data.length===2) {
      ctx.beginPath();ctx.arc(x(data[0]),y(data[1]),2,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.restore();
}

export const Plot= memo(function Plot({row,points,domain,axis,className=''}) {
  const ref=useRef(null);
  useEffect(()=>{
    const canvas=ref.current;
    const paint=()=>draw(canvas,row,points,domain,axis);
    paint();
    const observer=new ResizeObserver(paint);
    observer.observe(canvas);
    return ()=>observer.disconnect();
  },[row,points,domain,axis]);
  return <canvas ref={ref} className={'plot-canvas '+className} aria-label={row.title+' 曲线'} role="img"/>;
});

export function nearest(points,t) {
  if (!Number.isFinite(t) || !points?.length) return undefined;
  let low=0,high=points.length/2;
  while (low<high) {
    const m=(low+high)>>1;
    if(points[m*2]<t) low=m+1;else high=m;
  }
  if (low===0) return points[1];
  if (low>=points.length/2) return points[points.length-1];
  return points[(t-points[(low-1)*2]<points[low*2]-t?low-1:low)*2+1];
}

export function ModeStrip({events,start,end}) {
  const modes=events.filter(e=>e.kind==='mode'&&e.t<end);
  return <div className="mode-strip" aria-label="飞行模式变化">
    {modes.map((e,i)=>{
      const a=Math.max(start,e.t),b=Math.min(end,modes[i+1]?.t??end);
      if(b<=a)return null;
      const width=(b-a)/(end-start)*100;
      const {color,ink}=flightModeStyle(e.value);
      return <div key={i} className="mode-segment" style={{left:(a-start)/(end-start)*100+'%',width:width+'%',color:ink,background:color}} title={e.name}>
        {width>10?e.name:''}
      </div>;
    })}
  </div>;
}

export const Overview= memo(function Overview({overview,duration}) {
  const ref=useRef(null);
  useEffect(()=>{
    const paint=()=>{
      const el=ref.current;
      const {width,height}=el.getBoundingClientRect();
      const dpr=Math.min(2,window.devicePixelRatio||1);
      el.width=Math.round(width*dpr);el.height=Math.round(height*dpr);
      const ctx=el.getContext('2d');
      ctx.scale(dpr,dpr);
      if(!overview.length) return;
      const max=Math.max(.2,...overview.map(x=>x[1]).filter(Number.isFinite));
      ctx.beginPath();ctx.moveTo(0,height);
      for(const [t,value] of overview) if(Number.isFinite(value)) ctx.lineTo(t/duration*width,height-3-value/max*(height-7));
      ctx.lineTo(width,height);ctx.closePath();
      ctx.fillStyle='#b8744833';ctx.fill();
      ctx.strokeStyle='#d79569';ctx.lineWidth=1;ctx.stroke();
    };
    const observer = new ResizeObserver(paint);
    observer.observe(ref.current);paint();
    return ()=>observer.disconnect();
  },[overview,duration]);
  return <canvas ref={ref} aria-hidden="true"/>;
});
