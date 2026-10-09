import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// The renderer is ESM while Electron's main package is CommonJS. Load the same
// source without changing the application's module type.
const source=await readFile(new URL('../renderer/gestures.js',import.meta.url),'utf8');
const {GestureEngine}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function hand({pinch=false,scroll=false,x=.45,y=.3}={}){
 const points=Array.from({length:21},()=>({x:.5,y:.72,z:0}));
 points[0]={x:.5,y:.92};points[5]={x:.4,y:.67};points[17]={x:.64,y:.67};
 points[6]={x:.45,y:.57};points[8]={x,y};
 points[10]={x:.52,y:.57};points[12]={x:.52,y:scroll?.29:.73};
 points[14]={x:.58,y:.6};points[16]={x:.58,y:.74};
 points[18]={x:.64,y:.62};points[20]={x:.64,y:.76};
 points[4]=pinch?{x:x+.008,y:y+.008}:{x:.68,y:.6};return points;
}
test('a hand first detected already pinched cannot click',()=>{const e=new GestureEngine();assert.equal(e.update(hand({pinch:true}),100).click,false);assert.equal(e.update(hand({pinch:true}),220).click,false);});
test('a released hand followed by a sustained pinch emits one click',()=>{const e=new GestureEngine();e.update(hand(),100);assert.equal(e.update(hand({pinch:true}),160).click,false);assert.equal(e.update(hand({pinch:true}),270).click,true);assert.equal(e.update(hand({pinch:true}),400).click,false);assert.equal(e.update(hand({pinch:true}),510).click,false);});
test('a brief pinch is ignored, then a new deliberate pinch can click',()=>{const e=new GestureEngine();e.update(hand(),100);e.update(hand({pinch:true}),140);assert.equal(e.update(hand(),200).click,false);e.update(hand({pinch:true}),230);assert.equal(e.update(hand({pinch:true}),340).click,true);});
test('release and cooldown prevent duplicate activations',()=>{const e=new GestureEngine();e.update(hand(),100);e.update(hand({pinch:true}),160);assert.equal(e.update(hand({pinch:true}),270).click,true);e.update(hand(),310);e.update(hand({pinch:true}),330);assert.equal(e.update(hand({pinch:true}),450).click,false);assert.equal(e.update(hand({pinch:true}),730).click,true);});
test('tracking loss disarms selection until a fresh release',()=>{const e=new GestureEngine();e.update(hand(),100);e.update(hand({pinch:true}),170);assert.equal(e.update(null,190).mode,'none');assert.equal(e.update(hand({pinch:true}),230).click,false);assert.equal(e.update(hand({pinch:true}),350).click,false);e.update(hand(),400);e.update(hand({pinch:true}),470);assert.equal(e.update(hand({pinch:true}),580).click,true);});
test('a gap in frames disarms selection',()=>{const e=new GestureEngine();e.update(hand(),100);assert.equal(e.update(hand({pinch:true}),700).click,false);assert.equal(e.update(hand({pinch:true}),820).click,false);});
test('two-finger scrolling does not click and its first frame does not jump',()=>{const e=new GestureEngine();e.update(hand(),100);const first=e.update(hand({scroll:true}),140);assert.equal(first.mode,'scroll');assert.equal(first.scrollDelta,0);const next=e.update(hand({scroll:true,y:.34}),180);assert.equal(next.click,false);assert.ok(next.scrollDelta>0&&next.scrollDelta<=55);});
test('invalid landmarks fail closed',()=>{const e=new GestureEngine();for(const points of [[],hand().slice(0,20),hand().map(p=>({...p,x:NaN}))]){assert.deepEqual(e.update(points,100),{mode:'none',click:false});}});
test('the pointer is bounded and smoothing reduces sudden motion',()=>{const e=new GestureEngine();e.update(hand(),100);const p=e.update(hand({x:-2,y:-2}),133);assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);assert.ok(p.x<1&&p.y>0);});
test('a folded hand is distinct from pointing and does not activate a click',()=>{const points=hand();points[8]={x:.45,y:.74};const gesture=new GestureEngine().update(points,100);assert.equal(gesture.mode,'fist');assert.equal(gesture.click,false);});
test('an open palm is distinct from pointing and two-finger scrolling',()=>{const points=hand({scroll:true});points[16]={x:.58,y:.29};points[20]={x:.64,y:.31};const gesture=new GestureEngine().update(points,100);assert.equal(gesture.mode,'palm');assert.equal(gesture.click,false);assert.equal(gesture.scrollDelta,0);});

test('the pointer stays on its selected target throughout a pinch',()=>{
 const e=new GestureEngine(),before=e.update(hand(),100);
 const first=e.update(hand({pinch:true,x:.62,y:.4}),160);
 const clicked=e.update(hand({pinch:true,x:.65,y:.44}),270);
 assert.equal(clicked.click,true);assert.equal(first.x,before.x);assert.equal(first.y,before.y);
 assert.equal(clicked.x,before.x);assert.equal(clicked.y,before.y);
 const release=e.update(hand({x:.62,y:.4}),320);assert.notEqual(release.x,before.x);
});
test('pinch hysteresis tolerates threshold noise without cancelling or repeating selection',()=>{
 const e=new GestureEngine();e.update(hand(),100);e.update(hand({pinch:true}),160);
 const noise=hand();noise[4]={x:noise[8].x+.24*.32,y:noise[8].y};
 assert.equal(e.update(noise,210).mode,'pinch');assert.equal(e.update(hand({pinch:true}),270).click,true);
 e.update(noise,310);assert.equal(e.update(hand({pinch:true}),440).click,false);
});
test('a natural fist with touching thumb and index cannot select',()=>{
 const e=new GestureEngine();e.update(hand(),100);
 const fist=hand({pinch:true,x:.45,y:.74});
 for(const time of [160,270,400,620]){const result=e.update(fist,time);assert.equal(result.mode,'fist');assert.equal(result.click,false);}
});
test('scroll jitter is filtered and scrolling keeps the pointer steady',()=>{
 const e=new GestureEngine(),before=e.update(hand(),100);e.update(hand({scroll:true}),145);
 for(const [i,y]of [.302,.298,.301,.3].entries()){
  const result=e.update(hand({scroll:true,y}),190+i*45);
  assert.equal(result.scrollDelta,0);assert.equal(result.x,before.x);assert.equal(result.y,before.y);
 }
});
test('switching from scrolling directly to pinch cannot click a stale target',()=>{
 const e=new GestureEngine();e.update(hand(),100);e.update(hand({scroll:true}),150);
 e.update(hand({pinch:true}),200);assert.equal(e.update(hand({pinch:true}),320).click,false);
 e.update(hand(),380);e.update(hand(),455);e.update(hand(),530);
 e.update(hand({pinch:true}),580);assert.equal(e.update(hand({pinch:true}),690).click,true);
});

test('one missing detection preserves smoothing instead of jumping to the new hand position',()=>{
 const e=new GestureEngine(),before=e.update(hand(),100);
 assert.deepEqual(e.update(null,133),{mode:'none',click:false});
 const after=e.update(hand({x:.15}),166);
 const target=(1-.15-.12)/.76;
 assert.ok(after.x>before.x&&after.x<target);
 assert.ok(after.x-before.x<=.36*(target-before.x));
});
test('repeated missing detections expire the old position after a long absence',()=>{
 const e=new GestureEngine();e.update(hand(),100);
 for(const time of [150,250,400,450])e.update(null,time);
 const after=e.update(hand({x:.15}),480);
 assert.equal(after.x,(1-.15-.12)/.76);
});
test('a valid frame after a long absence starts fresh even without another missing frame',()=>{
 const e=new GestureEngine();e.update(hand(),100);e.update(null,140);
 const after=e.update(hand({x:.15}),500);
 assert.equal(after.x,(1-.15-.12)/.76);
});
test('a delayed valid frame does not apply an oversized smoothing step',()=>{
 const e=new GestureEngine(),before=e.update(hand(),100);
 const after=e.update(hand({x:.15}),350),target=(1-.15-.12)/.76;
 assert.ok(after.x>before.x);
 assert.ok(after.x-before.x<.5*(target-before.x));
});
test('tracking loss cannot clear the click cooldown',()=>{
 const e=new GestureEngine();e.update(hand(),100);e.update(hand({pinch:true}),140);
 assert.equal(e.update(hand({pinch:true}),250).click,true);
 e.update(null,270);e.update(hand(),300);e.update(hand({pinch:true}),340);
 assert.equal(e.update(hand({pinch:true}),450).click,false);
 assert.equal(e.update(hand({pinch:true}),590).click,false);
 assert.equal(e.update(hand({pinch:true}),710).click,true);
});
test('scrolling resumes after a dropout without carrying over old scroll distance',()=>{
 const e=new GestureEngine();e.update(hand(),100);e.update(hand({scroll:true}),145);
 e.update(hand({scroll:true,y:.38}),190);e.update(null,235);
 const recovered=e.update(hand({scroll:true,y:.4}),280);
 assert.equal(recovered.scrollDelta,0);assert.equal(recovered.click,false);
 assert.ok(e.update(hand({scroll:true,y:.44}),325).scrollDelta>0);
});
test('brief pointing while scrolling cannot move the cursor or arm a pinch',()=>{
 const e=new GestureEngine(),before=e.update(hand(),100);
 e.update(hand({scroll:true}),145);
 for(const time of [190,240]){
  const pointing=e.update(hand({x:.15}),time);
  assert.equal(pointing.x,before.x);assert.equal(pointing.y,before.y);
 }
 e.update(hand({pinch:true}),280);
 assert.equal(e.update(hand({pinch:true}),400).click,false);
});
test('settled pointing after scrolling restores cursor motion and click control',()=>{
 const e=new GestureEngine(),before=e.update(hand(),100);
 e.update(hand({scroll:true}),145);e.update(hand({x:.15}),190);
 e.update(hand({x:.15}),265);
 const settled=e.update(hand({x:.15}),340);
 assert.ok(settled.x>before.x);
 e.update(hand({pinch:true,x:.15}),390);
 assert.equal(e.update(hand({pinch:true,x:.15}),500).click,true);
});
test('a tracking miss restarts the scroll-to-point settling interval',()=>{
 const e=new GestureEngine(),before=e.update(hand(),100);
 e.update(hand({scroll:true}),145);e.update(hand({x:.15}),190);
 e.update(null,240);e.update(hand({x:.15}),280);
 assert.equal(e.update(hand({x:.15}),360).x,before.x);
 assert.ok(e.update(hand({x:.15}),430).x>before.x);
});
