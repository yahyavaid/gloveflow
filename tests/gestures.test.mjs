import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureEngine} from '../dist/gestures.js';

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
 e.update(hand(),380);e.update(hand({pinch:true}),430);assert.equal(e.update(hand({pinch:true}),540).click,true);
});
