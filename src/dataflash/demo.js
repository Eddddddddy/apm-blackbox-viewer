// A deterministic fictional log for exploring the interface before opening a file.
export function demoFile() {
  const output=new Uint8Array(5*1024*1024), view=new DataView(output.buffer), encoder=new TextEncoder();
  const specs={
    MSG:['QZ','TimeUS,Message'], ARM:['QB','TimeUS,ArmState'], EV:['QB','TimeUS,Id'], MODE:['QBBB','TimeUS,Mode,ModeNum,Rsn'],
    PARM:['QNff','TimeUS,Name,Value,Default'], ANG:['Qffffff','TimeUS,DesRoll,Roll,DesPitch,Pitch,DesYaw,Yaw'],
    RATE:['Qffffff','TimeUS,RDes,R,PDes,P,YDes,Y'], CTUN:['Qfffff','TimeUS,Alt,DAlt,BAlt,ThO,ThH'],
    ESC:['QBff','TimeUS,Instance,RPM,Curr'], BAT:['QBfff','TimeUS,Inst,Volt,Curr,CurrTot'],
    VISP:['QffffbbB','TimeUS,PX,PY,PZ,PErr,Q,Ign,Rst'], VISV:['Qfffb','TimeUS,VX,VY,VZ,Q'],
    RFND:['QBBf','TimeUS,Instance,Stat,Dist'], VIBE:['QBfffI','TimeUS,IMU,VibeX,VibeY,VibeZ,Clip'],
    GYR:['QBQfff','TimeUS,I,SampleUS,GyrX,GyrY,GyrZ'], IMU:['QBf','TimeUS,I,GyrX'], FTN:['QBBffff','TimeUS,I,NDn,NF1,NF2,NF3,NF4'],
    XKF1:['QBff','TimeUS,C,PN,PE'], XKF4:['QBfff','TimeUS,C,SV,SP,SH'],
    RCOU:['QHHHH','TimeUS,C1,C2,C3,C4'], RCIN:['QHHHH','TimeUS,C1,C2,C3,C4']
  };
  let p=0;
  const widths={Q:8,Z:64,N:16,f:4,b:1,B:1,H:2,I:4};
  const head=(id)=>{output[p++]=0xa3; output[p++]=0x95; output[p++]=id;};
  const text=(val,n)=>{output.set(encoder.encode(val).subarray(0,n),p);p+=n;};
  const definitions={};
  Object.entries(specs).forEach(([name,[format,fields]],i)=>{
    const id=129+i;
    definitions[name]={id,format};
    head(128); output[p++]=id; output[p++]=3+Array.from(format).reduce((n,f)=>n+widths[f],0);
    text(name,4); text(format,16); text(fields,64);
  });
  function add(name,...values) {
    const {id,format}=definitions[name];
    head(id);
    Array.from(format).forEach((f,i)=>{
      const v=values[i];
      if (f==='N'||f==='Z') {text(v,widths[f]);return;}
      if (f==='Q') view.setBigUint64(p,BigInt(v),true);
      if (f==='f') view.setFloat32(p,v,true);
      if (f==='B'||f==='b') view.setInt8(p,v);
      if (f==='H') view.setUint16(p,v,true);
      if (f==='I') view.setUint32(p,v,true);
      p+=widths[f];
    });
  }
  const cycle=(hz,s)=>Math.sin(2*Math.PI*hz*s);
  add('MSG',0,'ArduCopter · 演示数据');
  add('PARM',0,'FRAME_CLASS',1,0);
  add('PARM',0,'FRAME_TYPE',1,0);
  add('PARM',0,'RC2_REVERSED',1,0);
  add('PARM',0,'INS_RAW_LOG_OPT',10,0);
  add('PARM',0,'INS_HNTCH_ENABLE',1,0);
  add('PARM',0,'INS_HNTCH_MODE',3,0);
  add('PARM',0,'BATT_LOW_VOLT',14.4,0);
  add('PARM',0,'VISO_QUAL_MIN',20,0);
  for (let i=0;i<=54000;i++) {
    const t=i/1000,u=i*1000;
    if ([2000,24000].includes(i)) add('ARM',u,1);
    if ([18000,52000].includes(i)) add('ARM',u,0);
    if ([3300,25900].includes(i)) add('EV',u,28);
    if ([0,19000,24000].includes(i)) add('MODE',u,0,0,1);
    if ([6200,28000].includes(i)) add('MODE',u,5,5,1);
    if ([18000,52000].includes(i)) add('EV',u,18);
    const active=(t>2&&t<18)||(t>24&&t<52);
    const base=t<18 ? 3.3 : 25.9, end=t<18 ? 18 : 52;
    const rise=Math.max(0,Math.min(1,(t-base)/1.3,(end-t)/1.7));
    const move=Math.exp(-((t-34)**2)/18)+0.65*Math.exp(-((t-44)**2)/10);
    const roll=rise*(3.1*cycle(.62,t)+move*14*cycle(.31,t));
    const pitch=rise*(2.3*cycle(.48,t)+move*9*cycle(.42,t));
    const h=(2.8+0.36*cycle(.13,t))*rise;
    const volt=16.7-t*.031-(active?.26:0)-move*.12;
    const rpm=active?22000+5000*rise+1500*cycle(.52,t):0;
    const x=rise*(.5*cycle(.12,t)+move*.32),y=rise*(.36*cycle(.08,t+.3));
    if (i%5===0) {
      add('ANG',u,roll,roll+rise*.85*cycle(2.9,t),pitch,pitch+rise*.65*cycle(2.3,t),rise*24*cycle(.035,t),rise*24*cycle(.035,t)+0.15*cycle(.3,t));
      add('RATE',u,roll*6,roll*6+rise*5*cycle(9.5,t),pitch*5,pitch*5+rise*3*cycle(8.8,t),0,rise*2*cycle(.5,t));
    }
    if (i%20===0) {
      for (let m=0;m<4;m++) add('ESC',u,m,rpm+(active?m*680+570*cycle(.38,t+m*.13):0),active?5+rise*4+m*.16:0);
      add('FTN',u,0,4,rpm/60,(rpm+680)/60,(rpm+1360)/60,(rpm+2040)/60);
      add('XKF1',u,0,x+0.02*cycle(.47,t),y+0.03*cycle(.48,t));
      add('XKF4',u,0,.03*Math.abs(cycle(.51,t)),.04*Math.abs(cycle(.31,t)),.02*Math.abs(cycle(.33,t)));
    }
    if (i%30===0) {
      const q=t>36.1&&t<36.55 ? 10 : Math.round(96+2*cycle(.13,t));
      add('VISP',u,x,y,-h,0.20,q,q<20?1:0,1);
      add('VISV',u,0.4*cycle(.12,t+.1),0.27*cycle(.08,t+.4),0.03*cycle(.13,t+.2),q);
    }
    if (i%100===0) {
      add('CTUN',u,h,2.75*rise,h+0.023*cycle(.24,t),active?.12+.18*rise:0,.29);
      add('BAT',u,0,volt,active?15+9*rise:0.4,4.2*t);
      add('RFND',u,0,rise>.05?4:2,h+.13);
      add('VIBE',u,0,active?2.1+0.5*cycle(2.1,t):0.3,active?1.9+Math.abs(cycle(1.3,t)):0.3,active?3.6+0.55*cycle(2.48,t):0.45,0);
      add('IMU',u,0,0);
      add('RCIN',u,1500+30*roll,1500+32*pitch,active?1490+rise*70*cycle(.29,t):1000,1500+rise*80*move*cycle(.22,t));
      add('RCOU',u,active?1450+roll*4:1000,active?1460-roll*3:1000,active?1452+pitch*6:1000,active?1462-pitch*4:1000);
    }
    if (i%2===0) {
      const noise=(cycle(182,t)*.011+cycle(219,t)*.005+cycle(143.5,t)*.003)*(.1+rise);
      const raw=roll*.003+noise, filtered=roll*.003+noise*.12;
      add('GYR',u,0,u,raw,raw*.75+pitch*.001,raw*.38);
      add('GYR',u,1,u,filtered,filtered*.75+pitch*.001,filtered*.38);
    }
  }
  return new File([output.subarray(0,p)],'DEMO.BIN',{type:'application/octet-stream'});
}
