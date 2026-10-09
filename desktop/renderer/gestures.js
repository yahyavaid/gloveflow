/** Application-authored gesture interpretation over MediaPipe's 21 landmarks. */
export const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class GestureEngine {
  constructor(){this.threshold=.28;this.smoothing=.65;this.reset();}
  reset(){
    this.pointer=null;this.lastTime=null;this.lastValidTime=null;this.armed=false;this.pinchStart=null;
    this.pinching=false;this.latched=false;this.lastClick=-Infinity;
    this.scrollY=null;this.scrollAnchor=null;this.previousMode='none';
    this.returningFromScroll=false;this.pointSince=null;
  }
  loseTracking(now){
    // A missed camera frame must cancel an action without discarding the cursor's
    // smoothing history. After a longer absence, a newly found hand starts fresh.
    if(this.lastValidTime===null||now-this.lastValidTime>300){
      this.pointer=null;this.returningFromScroll=false;
    }
    this.lastTime=null;this.armed=false;this.pinchStart=null;
    this.pinching=false;this.latched=false;
    this.scrollY=null;this.scrollAnchor=null;this.previousMode='none';
    this.pointSince=null;
    // Keep lastClick: losing tracking must not bypass the click cooldown.
  }
  update(points,now){
    if(!Array.isArray(points)||points.length!==21||points.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y))){
      this.loseTracking(now);return {mode:'none',click:false};
    }
    if(this.lastValidTime!==null&&now-this.lastValidTime>300)this.loseTracking(now);
    // Do not turn a delayed frame into a large catch-up jump.
    const delta=this.lastTime!==null?clamp(now-this.lastTime,1,50):33;
    this.lastTime=now;this.lastValidTime=now;
    const palm=Math.max(.025,distance(points[5],points[17]));
    const ratio=distance(points[4],points[8])/palm;
    const fingerUp=(tip,pip)=>distance(points[tip],points[0])>distance(points[pip],points[0])*1.13;
    const index=fingerUp(8,6),middle=fingerUp(12,10),ring=fingerUp(16,14),pinky=fingerUp(20,18);
    const fist=!index&&!middle&&!ring&&!pinky;
    // A closed fist often brings thumb and index together. It must never click.
    if(fist){this.pinching=false;this.armed=false;this.pinchStart=null;this.latched=false;}
    else if(ratio>this.threshold+.13){
      this.pinching=false;this.armed=true;this.latched=false;this.pinchStart=null;
    }else if(ratio<this.threshold){this.pinching=true;}
    const mode=fist?'fist':this.pinching?'pinch':index&&middle&&ring&&pinky?'palm':index&&middle&&!ring&&!pinky?'scroll':index?'point':'rest';
    if(mode==='scroll')this.returningFromScroll=true;
    if(this.returningFromScroll){
      // During scrolling, a briefly folded middle finger can look like pointing.
      // Require a settled pointing pose before moving or arming a click again.
      if(mode==='point'){
        this.pointSince??=now;
        if(now-this.pointSince>=150)this.returningFromScroll=false;
      }else this.pointSince=null;
      if(this.returningFromScroll){this.armed=false;this.pinchStart=null;}
    }
    let click=false;
    if(mode==='pinch'&&this.armed&&!this.latched){
      this.pinchStart??=now;
      if(now-this.pinchStart>=100&&now-this.lastClick>=450){
        click=true;this.lastClick=now;this.latched=true;this.armed=false;
      }
    }else if(mode!=='pinch'){this.pinchStart=null;}
    const target={x:clamp((1-points[8].x-.12)/.76),y:clamp((points[8].y-.12)/.70)};
    const alpha=1-Math.pow(clamp(this.smoothing,.01,.95),delta/33);
    // Keep the selected location stable while fingers move together or scroll.
    if(!this.pointer)this.pointer=target;
    else if(mode==='point'&&!this.returningFromScroll)this.pointer={x:this.pointer.x+(target.x-this.pointer.x)*alpha,y:this.pointer.y+(target.y-this.pointer.y)*alpha};
    let scrollDelta=0;
    if(mode==='scroll'){
      if(this.previousMode!=='scroll'){this.scrollY=points[8].y;this.scrollAnchor=this.scrollY;}
      else{
        this.scrollY+=(points[8].y-this.scrollY)*(1-Math.pow(.5,delta/45));
        const movement=this.scrollY-this.scrollAnchor;
        // Small landmark wiggles should not move the document.
        if(Math.abs(movement)>.006){scrollDelta=movement*1800;this.scrollAnchor=this.scrollY;}
      }
    }else{this.scrollY=null;this.scrollAnchor=null;}
    this.previousMode=mode;
    return {mode,click,x:this.pointer.x,y:this.pointer.y,scrollDelta:clamp(scrollDelta,-55,55),ratio};
  }
}
