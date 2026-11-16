import {useEffect,useRef,useState} from 'react';
import {eventName} from '../replay/signals.js';

export const REPLAY_CHUNK=10;

export function useLog() {
  const worker=useRef(null),ids=useRef(0),requests=useRef({}),opened=useRef(false);
  const [file,setFile]=useState(null),[meta,setMeta]=useState(null),[progress,setProgress]=useState(null);
  const [points,setPoints]=useState({}),[chartBusy,setChartBusy]=useState(false);
  const [replayWindows,setReplayWindows]=useState([]),[replayError,setReplayError]=useState(false);
  const [frameResult,setFrameResult]=useState(null);
  const [frequency,setFrequency]=useState(null),[frequencyBusy,setFrequencyBusy]=useState(false);
  const [csvBusy,setCsvBusy]=useState(false),[error,setError]=useState(null);
  useEffect(()=>{
    const thread=new Worker(new URL('../dataflash/parser.worker.js',import.meta.url),{type:'module'});
    worker.current=thread;
    thread.onmessage=({data:msg})=>{
      const type=msg.type==='progress'?'open':msg.type==='error'?msg.data.type:msg.type;
      if (requests.current[type]!==msg.id) return;
      const value=msg.data;
      if(msg.type==='progress') setProgress(value);
      if(msg.type==='open') {setMeta({...value,events:value.events.map(e=>({...e,name:eventName(e)}))});setProgress(null);}
      if(msg.type==='chart') {setPoints(Object.fromEntries(value.map(d=>[d.id,d.points])));setChartBusy(false);}
      if(msg.type==='replay') {
        const {series,...range}=value;
        const points=Object.fromEntries(series.map(d=>[d.id,d.points]));
        setReplayWindows(current=>[{...range,points},...current.filter(w=>w.bucket!==range.bucket||w.key!==range.key)].slice(0,3));
      }
      if(msg.type==='frame') setFrameResult({id:msg.id,...value});
      if(msg.type==='spectrum') {setFrequency(value);setFrequencyBusy(false);}
      if(msg.type==='csv') {
        setCsvBusy(false);
        const url=URL.createObjectURL(new Blob([value],{type:'text/csv;charset=utf-8'}));
        const link=document.createElement('a');
        link.href=url;link.download=(fileName.current||'blackbox').replace(/\.[^.]+$/,'')+'-trace.csv';
        link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      if(msg.type==='error') {
        if(type==='replay') {setReplayError(true);return;}
        if(type==='frame') setFrameResult({id:msg.id,target:null});
        setError(value.message);
        if(type==='open') setProgress(null);
        if(type==='chart') setChartBusy(false);
        if(type==='spectrum') setFrequencyBusy(false);
        if(type==='csv') setCsvBusy(false);
      }
    };
    thread.onerror=()=>{
      setError('浏览器无法启动日志解析。请刷新页面后重试。');
      setProgress(null);setChartBusy(false);setFrequencyBusy(false);setCsvBusy(false);setReplayError(true);
    };
    let active=true;
    import('../dataflash/demo.js').then(({demoFile})=>{if(active&&!opened.current) open(demoFile(),true);});
    return()=>{active=false;thread.terminate();};
  },[]);
  const fileName=useRef('');
  function request(type,data) {
    const id=++ids.current;
    requests.current[type]=id;
    worker.current?.postMessage({type,id,...data});
    return id;
  }
  function open(next,demo=false) {
    if(!next) return;
    opened.current=true;
    requests.current={};
    fileName.current=next.name;
    setFile({name:next.name,size:next.size,demo});
    setMeta(null);setPoints({});setFrequency(null);setReplayWindows([]);setReplayError(false);setFrameResult(null);
    setProgress(0);setError(null);setChartBusy(false);setFrequencyBusy(false);setCsvBusy(false);
    request('open',{file:next});
  }
  return {
    file,meta,progress,points,chartBusy,replayWindows,replayError,frameResult,frequency,frequencyBusy,csvBusy,error,open,clear:()=>setError(null),
    replay:(series,key,bucket,duration)=>{
      setReplayError(false);
      request('replay',{series,key,bucket,start:Math.max(0,bucket-1.5),end:Math.min(duration,bucket+REPLAY_CHUNK+1)});
    },
    findFrame:(signal,time,direction,count,scope)=>request('frame',{signal,time,direction,count,scope}),
    chart:(series,start,end,pixels)=>{setChartBusy(true);request('chart',{series,start,end,pixels});},
    fft:(series,start,end)=>{setFrequencyBusy(true);setFrequency(null);setError(null);request('spectrum',{series,start,end});},
    csv:(series,start,end)=>{setCsvBusy(true);setError(null);request('csv',{series,start,end});}
  };
}
