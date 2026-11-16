import {chartData,indexLog,readSampleWindow,readFrameStep,visitSeries} from './parser.js';
import {spectrum} from './spectrum.js';

let log;
const revisions={open:0,chart:0,replay:0,frame:0,spectrum:0,csv:0};
const send=(type,id,data,transfer=[])=>self.postMessage({type,id,data},transfer);
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';

self.onmessage = async ({data:message}) => {
  const {type,id}=message;
  const rev=++revisions[type];
  const opening=revisions.open;
  const cancelled=()=>revisions[type]!==rev || revisions.open!==opening;
  try {
    if (type==='open') {
      log=null;
      const result=await indexLog(message.file,p=>send('progress',id,p),cancelled);
      if (result && !cancelled()) {
        log=result;
        send(type,id,result.meta);
      }
      return;
    }
    if (!log) throw new Error('请先打开一份日志。');
    if (type==='chart') {
      const result=await chartData(log,message.series,message.start,message.end,message.pixels,cancelled);
      if (!cancelled()) send(type,id,result,result.map(d=>d.points.buffer));
    }
    if (type==='replay') {
      const {bucket,key,series,start,end}=message;
      const result=await readSampleWindow(log,series,start,end,cancelled);
      if (!cancelled()) send(type,id,{bucket,key,start,end,series:result},result.map(d=>d.points.buffer));
    }
    if (type==='frame') {
      const {signal,time,direction,count,scope}=message;
      const target=await readFrameStep(log,signal,time,direction,count,scope,cancelled);
      if (!cancelled()) send(type,id,{target});
    }
    if (type==='spectrum') {
      const result=await spectrum(log,message.series,message.start,message.end,cancelled);
      if (result && !cancelled()) send(type,id,result,result.series.map(d=>d.points.buffer));
    }
    if (type==='csv') {
      const rows=['time_s,signal,value,unit'];
      await visitSeries(log,message.series,message.start,message.end,(i,t,v)=>{
        if (rows.length>250000) throw new Error('当前范围超过 25 万个数据点。缩小时间范围后再导出。');
        const field=message.series[i];
        rows.push([t.toFixed(6),quote(field.id),v,quote(field.unit)].join(','));
      },cancelled);
      if (!cancelled()) send(type,id,rows.join('\r\n'));
    }
  } catch(error) {
    if (!cancelled()) send('error',id,{type,message:error?.message ?? '无法读取该文件。'});
  }
};
