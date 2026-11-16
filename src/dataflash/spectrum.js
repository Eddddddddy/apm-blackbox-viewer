import {visitSeries,numeric} from './parser.js';

function median(values) {
  values.sort((a,b)=>a-b);
  return values[Math.floor(values.length/2)];
}

function transform(real,imag) {
  const n=real.length;
  for (let j=1,k=0;j<n;j++) {
    let bit=n>>1;
    for (;k&bit;bit>>=1) k^=bit;
    k^=bit;
    if (j<k) [real[j],real[k]]=[real[k],real[j]];
  }
  for (let step=2;step<=n;step*=2) {
    const angle=-2*Math.PI/step, half=step/2;
    for (let j=0;j<half;j++) {
      const c=Math.cos(angle*j), s=Math.sin(angle*j);
      for (let k=j;k<n;k+=step) {
        const q=k+half, re=c*real[q]-s*imag[q], im=s*real[q]+c*imag[q];
        real[q]=real[k]-re; imag[q]=imag[k]-im;
        real[k]+=re; imag[k]+=im;
      }
    }
  }
}

function getSampleRate(samples) {
  const steps=[];
  for (let i=1;i<samples.length;i++) {
    const step=samples[i][0]-samples[i-1][0];
    if (step>0) steps.push(step);
  }
  const typical=median(steps);
  const continuous=steps.filter(step=>step < typical*4);
  return continuous.length/continuous.reduce((acc,step)=>acc+step,0);
}

function powerSpectrum(samples,sampleRate,fftSize) {
  const filtered = new Float64Array(fftSize/2+1);
  const hann=Float64Array.from({length:fftSize},(_,i)=>0.5-0.5*Math.cos(2*Math.PI*i/(fftSize-1)));
  const scale=sampleRate*hann.reduce((acc,v)=>acc+v*v,0);
  const real=new Float64Array(fftSize), imag=new Float64Array(fftSize);
  const step=1/sampleRate;
  const count=Math.floor((samples.at(-1)[0]-samples[0][0])*sampleRate)+1;
  let accepted=0,cursor=0;
  for (let start=0;start+fftSize<=count;start+=fftSize/2) {
    let sum=0,gap=false;
    for (let i=0;i<fftSize;i++) {
      const t=samples[0][0]+(start+i)*step;
      while (cursor>0 && t<samples[cursor][0]) cursor--;
      while (cursor+1<samples.length-1 && samples[cursor+1][0]<t) cursor++;
      const [a,x]=samples[cursor], [b,y]=samples[cursor+1];
      if (b-a>step*4) { gap=true; break; }
      real[i]=a<b ? x+(y-x)*(t-a)/(b-a) : x;
      sum+=real[i];
    }
    if (gap) continue;
    for (let i=0;i<fftSize;i++) real[i]=(real[i]-sum/fftSize)*hann[i];
    imag.fill(0);
    transform(real,imag);
    for (let i=0;i<filtered.length;i++) filtered[i]+=(real[i]**2+imag[i]**2)/scale*(i===0 || i===fftSize/2 ? 1:2);
    accepted++;
  }
  if (!accepted) return null;
  return Float64Array.from(filtered,p=>10*Math.log10(Math.max(p/accepted,1e-16)));
}

export async function spectrum(log, series, start, end, cancelled) {
  const samples=series.map(()=>[]);
  await visitSeries(log,series,start,end,(i,t,v,def,view,p)=>{
    const stamp=def.byName.get('SampleUS');
    const sampleTime=stamp ? (numeric(view,p,stamp)-log.first)/1e6 : t;
    samples[i].push([sampleTime,v]);
  },cancelled);
  if (cancelled()) return null;
  samples.forEach(points=>points.sort((a,b)=>a[0]-b[0]));
  const valid=samples.map((points,i)=>({points,series:series[i]})).filter(({points})=>points.length>=256);
  if (!valid.length) throw new Error('这个时间段的陀螺仪样本不足，试着增大分析时长。');
  const sampleRate=getSampleRate(valid[0].points);
  if (!Number.isFinite(sampleRate)) throw new Error('无法从采样时间确定频率。');
  const fftSize=2**Math.max(7,Math.min(12,Math.floor(Math.log2(valid[0].points.length/2))));
  const spectra=valid.flatMap(({series:signal,points})=>{
    const density=powerSpectrum(points,sampleRate,fftSize);
    if (!density) return [];
    const pointsOut=new Float64Array(density.length*2);
    for (let i=0;i<density.length;i++) {
      pointsOut[i*2]=i*sampleRate/fftSize;
      pointsOut[i*2+1]=density[i];
    }
    return [{id:signal.id,points:pointsOut}];
  });
  if (!spectra.length) throw new Error('这个时间段的采样缺口使频谱无法计算，试着移动播放头。');
  const midpoint=(start+end)/2;
  const notchSignals=[1,2,3,4].map(i=>({type:'FTN',field:`NF${i}`,instance:0}));
  const nearest=Array(4).fill(null);
  await visitSeries(log,notchSignals,midpoint-.15,midpoint+.15,(i,t,v)=>{
    const distance=Math.abs(t-midpoint);
    if (!nearest[i] || distance<nearest[i].distance) nearest[i]={distance,value:v};
  },cancelled);
  const notches=nearest.filter(n=>n?.value>0).map(n=>n.value);
  return {sampleRate,fftSize,series:spectra,start,end,notches};
}
