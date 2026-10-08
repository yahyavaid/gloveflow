/** Application-authored gesture interpretation over MediaPipe's 21 landmarks. */
export const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class GestureEngine {
  constructor(){this.threshold=.28;this.smoothing=.65;this.reset();}
  reset(){this.pointer=null;this.lastTime=0;this.armed=false;this.pinchStart=null;this.latched=false;this.lastClick=-Infinity;this.scrollY=null;this.previousMode='none';}
  update(points,now){
    if(!Array.isArray(points)||points.length!==21||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))){this.reset();return {mode:'none',click:false};}
    if(this.lastTime && now-this.lastTime>300)this.reset();
    const delta=this.lastTime?Math.max(1,now-this.lastTime):33;this.lastTime=now;
    const palm=Math.max(.025,distance(points[5],points[17]));
    const ratio=distance(points[4],points[8])/palm;
    const fingerUp=(tip,pip)=>distance(points[tip],points[0])>distance(points[pip],points[0])*1.13;
    const index=fingerUp(8,6),middle=fingerUp(12,10),ring=fingerUp(16,14),pinky=fingerUp(20,18);
    const pinched=ratio<this.threshold;
    if(ratio>this.threshold+.13){this.armed=true;this.latched=false;this.pinchStart=null;}
    let click=false;
    if(pinched && this.armed && !this.latched){
      this.pinchStart??=now;
      if(now-this.pinchStart>=100 && now-this.lastClick>=450){click=true;this.lastClick=now;this.latched=true;this.armed=false;}
    }else if(!pinched){this.pinchStart=null;}
    const mode=pinched?'pinch':index&&middle&&ring&&pinky?'palm':!index&&!middle&&!ring&&!pinky?'fist':index&&middle&&!ring&&!pinky?'scroll':index?'point':'rest';
    const target={x:clamp((1-points[8].x-.12)/.76),y:clamp((points[8].y-.12)/.70)};
    const alpha=1-Math.pow(clamp(this.smoothing,.01,.95),delta/33);
    this.pointer=this.pointer?{x:this.pointer.x+(target.x-this.pointer.x)*alpha,y:this.pointer.y+(target.y-this.pointer.y)*alpha}:target;
    const scrollDelta=mode==='scroll'&&this.previousMode==='scroll'?(points[8].y-this.scrollY)*1800:0;
    this.scrollY=mode==='scroll'?points[8].y:null;this.previousMode=mode;
    return {mode,click,x:this.pointer.x,y:this.pointer.y,scrollDelta:clamp(scrollDelta,-55,55),ratio};
  }
}
