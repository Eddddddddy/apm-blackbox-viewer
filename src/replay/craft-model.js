import {attitudeTransform} from './craft-data.js';

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const add=([a,b,c],[x,y,z])=>[a+x,b+y,c+z];
const sub=([a,b,c],[x,y,z])=>[a-x,b-y,c-z];
const dot=([a,b,c],[x,y,z])=>a*x+b*y+c*z;
const cross=([a,b,c],[x,y,z])=>[b*z-c*y,c*x-a*z,a*y-b*x];
const normalize=v=>v.map(a=>a/Math.hypot(...v));
const eye=normalize([0.65,1.64,2.64]);
const right=normalize([eye[2],0,-eye[0]]);
const up=cross(eye,right);
const light=normalize([-0.5,1,0.3]);
const identity=v=>v;

function prism(mesh, polygon, low, high, color, transform=identity) {
  const area=polygon.reduce((acc,[x,z],i)=>{
    const [nx,nz]=polygon[(i+1)%polygon.length];
    return acc+x*nz-z*nx;
  },0);
  const points=area>0?polygon:polygon.toReversed();
  const rings=[low,high].map(y=>points.map(([x,z])=>transform([x,y,z])));
  const face=vertices=>{
    const normal=normalize(cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[1])));
    mesh.push({vertices,normal,color});
  };
  face(rings[0]);
  face(rings[1].toReversed());
  for(let i=0;i<points.length;i++){
    const j=(i+1)%points.length;
    face([rings[0][i],rings[1][i],rings[1][j],rings[0][j]]);
  }
}

function chamfer(x,z,c) {
  return [[-x+c,-z],[x-c,-z],[x,-z+c],[x,z-c],[x-c,z],[-x+c,z],[-x,z-c],[-x,-z+c]];
}

function disc(radius,sides=12) {
  return Array.from({length:sides},(_,i)=>{
    const a=i/sides*2*Math.PI;
    return [Math.cos(a)*radius,Math.sin(a)*radius];
  });
}

function hexRgb(color) {
  return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
}

export function buildQuadMesh(motors) {
  const body=[];
  const carbon=[61,73,82], edge=[104,119,126], frame=[82,94,100], silver=[154,163,166], nose=[251,145,78];
  prism(body,chamfer(.42,.58,.12),-.14,-.07,edge);
  prism(body,chamfer(.37,.54,.11),-.06,.10,carbon);
  prism(body,chamfer(.40,.56,.10),.10,.16,frame);
  prism(body,chamfer(.22,.30,.065),.16,.27,[118,130,133]);
  prism(body,chamfer(.19,.13,.035),.10,.28,nose,p=>add(p,[0,0,-.50]));
  prism(body,disc(.105),0,.095,[32,40,46],([x,y,z])=>[x,z+.193,-.61-y]);
  prism(body,disc(.053),.092,.102,[109,167,175],([x,y,z])=>[x,z+.193,-.61-y]);
  prism(body,[[0,-.43],[.106,-.23],[-.106,-.23]],.164,.172,nose);
  for(const x of [-.25,.25])for(const z of [-.40,.40]){
    prism(body,disc(.038,6),.16,.184,silver,p=>add(p,[x,0,z]));
  }
  const rotors=motors.map(m=>{
    const {x,z,color}=m;
    const len=Math.hypot(x,z),ux=x/len,uz=z/len;
    const arm=chamfer(.119,len*.5,.075);
    prism(body,arm,-.067,.021,carbon,([px,y,pz])=>[px*uz+(pz+len*.5)*ux,y,-px*ux+(pz+len*.5)*uz]);
    const motorFaces=[];
    const at=p=>add(p,[x,0,z]);
    prism(motorFaces,disc(.222),-.069,.006,frame,at);
    prism(motorFaces,disc(.175),.007,.157,silver,at);
    prism(motorFaces,disc(.143),.132,.177,hexRgb(color),at);
    prism(motorFaces,disc(.080,8),.178,.208,edge,at);
    const blade=[[.045,-.022],[.13,-.056],[.39,-.066],[.49,-.028],[.503,.014],[.40,.069],[.21,.08],[.086,.049]];
    for(let b=0;b<3;b++){
      const angle=b/3*2*Math.PI+.21+(x>0?.10:0);
      const c=Math.cos(angle),s=Math.sin(angle);
      const shape=blade.map(([px,pz])=>[px*c-pz*s,px*s+pz*c]);
      prism(motorFaces,shape,.181,.204,hexRgb(color),at);
    }
    prism(motorFaces,disc(.065,8),.204,.247,silver,at);
    return {motorFaces,rim:disc(.53,30).map(([px,pz])=>[px+x,.19,pz+z]),anchor:[x,.247,z]};
  });
  return {body,rotors};
}

function drawPolygon(ctx,vertices) {
  ctx.beginPath();
  ctx.moveTo(vertices[0][0],vertices[0][1]);
  for(let i=1;i<vertices.length;i++)ctx.lineTo(vertices[i][0],vertices[i][1]);
  ctx.closePath();
}

function grid(ctx,project) {
  ctx.strokeStyle='#333b40';
  ctx.lineWidth=.55;
  const line=(a,b)=>{
    const [ax,ay]=project(a), [bx,by]=project(b);
    ctx.moveTo(ax,ay);ctx.lineTo(bx,by);
  };
  ctx.beginPath();
  for(let i=-2;i<=2;i++){
    line([i*.58,-.61,-1.62],[i*.58,-.61,1.62]);
    line([-1.62,-.61,i*.58],[1.62,-.61,i*.58]);
  }
  ctx.stroke();
}

function placeLabels(anchors,width,height) {
  const w=66,h=22,placed=[];
  for(const [x,y] of anchors){
    const sx=x>=width/2?1:-1,sy=y>=height/2?1:-1;
    const choices=[[sx*28,sy*20],[sx*32,-sy*19],[sx*16,sy*34],[-sx*12,sy*37],
      [sx*45,0],[-sx*37,sy*24],[sx*17,-sy*33],[-sx*17,-sy*34]];
    let best,bestScore=Infinity;
    choices.forEach(([dx,dy],order)=>{
      const label={x:clamp(x+dx,w/2+3,width-w/2-3),y:clamp(y+dy,h/2+3,height-h/2-3)};
      const overlap=placed.some(p=>Math.abs(p.x-label.x)<w+3&&Math.abs(p.y-label.y)<h+4);
      const coversHub=anchors.some(([ax,ay])=>Math.abs(ax-label.x)<w/2+4&&Math.abs(ay-label.y)<h/2+4);
      const score=order+(overlap?1000:0)+(coversHub?100:0)+Math.abs(x+dx-label.x)*.3+Math.abs(y+dy-label.y)*.3;
      if(score<bestScore){best=label;bestScore=score;}
    });
    placed.push(best);
  }
  return placed;
}

export function paintCraft(canvas,mesh,motors,pose,rpm) {
  const {width,height}=canvas.getBoundingClientRect();
  if(!width||!height)return [];
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const w=Math.round(width*dpr),h=Math.round(height*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');
  if(!ctx)return [];
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height);
  const scale=Math.min(width/4.65,height/4.4);
  const project=p=>[width/2+dot(right,p)*scale,height*.48-dot(up,p)*scale,dot(eye,p)];
  const rotate=attitudeTransform(...(pose??[0,0,0]));
  const transform=p=>project(rotate(p));
  grid(ctx,project);
  ctx.globalAlpha=pose?1:.32;

  const faces=[];
  const gather=({vertices,normal,color})=>{
    const n=rotate(normal);
    if(dot(n,eye)<=.005)return;
    const projected=vertices.map(transform);
    const depth=projected.reduce((d,p)=>d+p[2],0)/projected.length;
    const l=.55+.45*Math.max(0,dot(n,light));
    faces.push({projected,depth,color:color.map(c=>Math.round(c*l))});
  };
  mesh.body.forEach(gather);
  mesh.rotors.forEach((rotor,i)=>{
    rotor.motorFaces.forEach(gather);
    const projected=rotor.rim.map(transform);
    const depth=projected.reduce((d,p)=>d+p[2],0)/projected.length;
    faces.push({projected,depth:depth-.017,rim:motors[i].color,active:Math.abs(rpm[i]??0)>0});
  });
  faces.sort((a,b)=>a.depth-b.depth);
  const outerAlpha=ctx.globalAlpha;
  for(const face of faces){
    drawPolygon(ctx,face.projected);
    if(face.rim){
      ctx.strokeStyle=face.rim;
      ctx.lineWidth=.65;
      ctx.globalAlpha=outerAlpha*(face.active?.6:.32);
      ctx.stroke();
      ctx.globalAlpha=outerAlpha*(face.active?.095:.03);
      ctx.fillStyle=face.rim;
      ctx.fill();
      ctx.globalAlpha=outerAlpha;
    }else{
      ctx.fillStyle=`rgb(${face.color.join(',')})`;
      ctx.strokeStyle=ctx.fillStyle;
      ctx.lineWidth=.48;
      ctx.fill();ctx.stroke();
    }
  }
  ctx.globalAlpha=1;
  const anchors=mesh.rotors.map(rotor=>transform(rotor.anchor));
  const labels=placeLabels(anchors,width,height);
  labels.forEach((p,i)=>{
    const [x,y]=anchors[i];
    ctx.strokeStyle=motors[i].color;
    ctx.globalAlpha=.75;
    ctx.lineWidth=.9;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(p.x,p.y);ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,1.65,0,2*Math.PI);
    ctx.fillStyle=motors[i].color;ctx.fill();
  });
  ctx.globalAlpha=1;
  return labels;
}
