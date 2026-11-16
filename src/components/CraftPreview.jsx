import React,{useCallback,useLayoutEffect,useMemo,useRef} from 'react';
import {Box} from 'lucide-react';
import {sampleAt} from '../replay/craft-data.js';
import {buildQuadMesh,paintCraft} from '../replay/craft-model.js';

const NO_POINTS={};
const degrees=v=>Number.isFinite(v)?`${v.toFixed(1)}°`:'—';
const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});

export function CraftPreview({config,points=NO_POINTS,cursor,pending}) {
  const canvas=useRef(null),labels=useRef([]);
  const mesh=useMemo(()=>buildQuadMesh(config.motors),[config]);
  const raw=['Roll','Pitch','Yaw'].map(key=>sampleAt(points[key],cursor,true));
  const hasPose=raw.every(Number.isFinite);
  const yaw=Number.isFinite(raw[2])?((raw[2]%360+360)%360):undefined;
  const rpm=config.motors.map(m=>sampleAt(points[m.id],cursor));
  const frame=useRef(null);
  frame.current={pose:hasPose?raw:null,rpm};

  const draw=useCallback(()=>{
    if(!canvas.current)return;
    const positions=paintCraft(canvas.current,mesh,config.motors,frame.current.pose,frame.current.rpm);
    positions.forEach(({x,y},i)=>{
      const label=labels.current[i];
      if(!label)return;
      label.style.left=x+'px';
      label.style.top=y+'px';
      label.style.visibility='visible';
    });
  },[mesh,config]);
  useLayoutEffect(()=>{
    if(!canvas.current)return;
    const observer=new ResizeObserver(draw);
    observer.observe(canvas.current);
    return ()=>observer.disconnect();
  },[draw]);

  useLayoutEffect(draw,[draw,cursor,points]);

  return <section className="side-section craft-section" aria-label="飞行器姿态与电机转速">
    <div className="side-heading"><Box size={15}/><h2>飞行器姿态</h2><span className="craft-units">{config.supported?'Quad X · RPM':'Quad X'}</span></div>
    {config.supported?<>
      <div className="craft-stage">
        <canvas ref={canvas} aria-hidden="true"/>
        {config.motors.map((m,i)=>{
          const value=Number.isFinite(rpm[i])?number.format(rpm[i]):'—';
          return <span key={m.id} ref={node=>{labels.current[i]=node;}} className="craft-rpm"
            title={`电机 ${i+1} · ${m.position}${m.output==null?'':` · 输出 ${m.output}`}`}
            aria-label={`电机 ${i+1} ${m.position} ${value==='—'?'缺少转速记录':value+' RPM'}`}>
            <b style={{color:m.color}}>{m.id}</b><span>{value}</span>
          </span>;
        })}
        {!hasPose&&<div className="craft-status">{pending?'正在读取姿态…':'此时刻缺少姿态记录'}</div>}
      </div>
      <dl className="craft-angles" title={config.attitudeType??'姿态'}>
        <div><dt>横滚</dt><dd>{degrees(raw[0])}</dd></div>
        <div><dt>俯仰</dt><dd>{degrees(raw[1])}</dd></div>
        <div><dt>偏航</dt><dd>{degrees(yaw)}</dd></div>
      </dl>
    </>:<p className="craft-unsupported">当前 3D 视图适用于 Quad X 机架。</p>}
  </section>;
}
