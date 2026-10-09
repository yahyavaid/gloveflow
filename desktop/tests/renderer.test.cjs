const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

async function harness(){
 const elements=new Map();let receiveState,receiveStop;
 const element=id=>{
  if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,disabled:false,style:{},listeners:new Map(),addEventListener(name,callback){this.listeners.set(name,callback);}});
  return elements.get(id);
 };
 const api={
  status:async()=>({trusted:true,camera:'not-determined',emergencyShortcut:true}),
  enable:async()=>({enabled:true,paused:false,reason:'Point to move the cursor, or hold two fingers to start scrolling.'}),
  onControlState:callback=>{receiveState=callback;},onStopped:callback=>{receiveStop=callback;}
 };
 // Run the production renderer with a minimal DOM. No camera, inference or native input is started.
 const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8').split('\n').filter(line=>!line.startsWith('import ')).join('\n');
 const context={
  document:{getElementById:element},window:{gloveflow:api,addEventListener(){}},
  GestureEngine:class{reset(){}},PoseHold:class{reset(){}},cancelAnimationFrame(){},requestAnimationFrame(){return 1;}
 };
 const controls=await vm.runInNewContext(`(async()=>{${source}\nreturn {preview(){stream={getTracks:()=>[]};renderMode();}};})()`,context);
 return {element,preview:controls.preview,enable:()=>element('control').listeners.get('click')(),state:status=>receiveState(status),stop:reason=>receiveStop(reason)};
}

test('renderer replaces stale arming instructions with actual readiness and pause guidance',async()=>{
 const h=await harness();h.preview();await h.enable();
 assert.match(h.element('message').textContent,/Point to move/);
 h.state({enabled:true,paused:false,reason:'Desktop control is active.'});
 assert.equal(h.element('message').textContent,'Desktop control is active.');
 assert.equal(h.element('mode').textContent,'MAC CONTROL ON');
 h.state({enabled:true,paused:false,reason:'Two-finger scrolling is active.'});
 assert.equal(h.element('message').textContent,'Two-finger scrolling is active.');
 h.state({enabled:true,paused:true,reason:'Desktop control is paused.'});
 assert.equal(h.element('mode').textContent,'CURSOR PAUSED');
 assert.equal(h.element('pause').textContent,'Resume cursor');
 assert.match(h.element('message').textContent,/Hold an open palm for one second/);
 h.state({enabled:true,paused:false,reason:'Desktop control is active.'});
 assert.equal(h.element('pause').textContent,'Pause cursor');
 assert.equal(h.element('message').textContent,'Desktop control is active.');
});

test('late status messages cannot enable preview control or overwrite a stopped session',async()=>{
 const h=await harness();h.preview();
 h.state({enabled:true,paused:false,reason:'Desktop control is active.'});
 assert.equal(h.element('mode').textContent,'CAMERA PREVIEW');
 assert.equal(h.element('message').textContent,'');
 await h.enable();h.stop('Tracking heartbeat was lost. Restart tracking.');
 h.state({enabled:true,paused:false,reason:'Desktop control is active.'});
 assert.equal(h.element('mode').textContent,'READY');
 assert.equal(h.element('pause').disabled,true);assert.equal(h.element('control').disabled,true);
 assert.equal(h.element('message').textContent,'Tracking heartbeat was lost. Restart tracking.');
});
