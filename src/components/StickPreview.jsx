import React from 'react';
import {ChevronDown,Gamepad2} from 'lucide-react';
import {readSticks,STICK_LAYOUTS,stickPercent} from '../replay/rc-sticks.js';

function StickPad({label,axisIds,axes,values,className}) {
  const [horizontal,vertical]=axisIds.map(id=>axes[id]);
  const [x,y]=axisIds.map(id=>values[id]);
  return <div className={'stick-card '+className} role="group" aria-label={label}>
    <div className="stick-pad" aria-hidden="true">
      <span className="stick-guide stick-guide-horizontal"/><span className="stick-guide stick-guide-vertical"/>
      <span className="stick-travel">
        {x&&y&&<span className="stick-dot" style={{left:(1+x.position)*50+'%',top:(1-y.position)*50+'%'}}/>}
      </span>
    </div>
    <div className="stick-readouts">
      <h3>{label}</h3>
      {[horizontal,vertical].map(axis=>{
        const value=values[axis.id];
        return <div key={axis.id} className="stick-reading" title={`CH${axis.channel} · ${value?value.pwm+' µs':'无有效样本'}`}>
          <span>{axis.label}</span><small>CH{axis.channel}</small>
          <span className="stick-value" data-axis={axis.id}>{value?stickPercent(axis,value.percent)+'%':'—'}</span>
        </div>;
      })}
    </div>
  </div>;
}

export function StickPreview({config,points,cursor,pending,mode,setMode}) {
  const values=readSticks(config,points,cursor);
  const empty=!Object.values(values).some(Boolean);
  return <section className="stick-panel" aria-label="遥控摇杆回放">
    <div className="stick-heading">
      <div className="side-heading"><Gamepad2 size={15}/><h2>遥控摇杆</h2></div>
      {empty&&<span className="stick-status">{pending?'读取遥控输入…':config.series.length?'此时刻无遥控输入':'日志未记录遥控输入'}</span>}
      <label className="select-wrap stick-mode"><select aria-label="摇杆布局" value={mode} onChange={e=>setMode(Number(e.target.value))}>
        {[1,2,3,4].map(id=><option key={id} value={id}>Mode {id}{id===2?' · 美国手':''}</option>)}
      </select><ChevronDown size={13}/></label>
    </div>
    <div className="stick-pair">
      <StickPad label="左摇杆" axisIds={STICK_LAYOUTS[mode][0]} axes={config.axes} values={values} className="stick-left"/>
      <StickPad label="右摇杆" axisIds={STICK_LAYOUTS[mode][1]} axes={config.axes} values={values} className="stick-right"/>
    </div>
  </section>;
}
