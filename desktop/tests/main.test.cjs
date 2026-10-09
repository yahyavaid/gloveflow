const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {EventEmitter}=require('node:events');
async function harness({trusted=true,shortcut=true}={}){
 const handles=new Map(),listeners=new Map(),timers=new Map(),posted=[];let id=0,window,quit=0,time=0;
 const app=new EventEmitter();app.whenReady=()=>Promise.resolve();app.quit=()=>quit++;
 class Window extends EventEmitter{
  constructor(options){super();window=this;this.options=options;this.destroyed=false;this.messages=[];const contents=new EventEmitter();
   contents.mainFrame={url:'gloveflow://app/index.html'};contents.getURL=()=>contents.mainFrame.url;contents.send=(...args)=>this.messages.push(args);contents.setWindowOpenHandler=fn=>this.openHandler=fn;
   contents.session={setPermissionRequestHandler:fn=>this.permissionRequest=fn,setPermissionCheckHandler:fn=>this.permissionCheck=fn};this.webContents=contents;
  }
  isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.emit('closed');}loadURL(){}
 }
 const driver={bounds:()=>({x:0,y:0,width:1512,height:982}),move:(...args)=>posted.push(['move',...args]),click:(...args)=>posted.push(['click',...args]),scroll:(...args)=>posted.push(['scroll',...args])};
 const electron={app,BrowserWindow:Window,ipcMain:{handle:(key,fn)=>handles.set(key,fn),on:(key,fn)=>listeners.set(key,fn)},protocol:{registerSchemesAsPrivileged(){},handle(){}},net:{fetch(){}},systemPreferences:{isTrustedAccessibilityClient:()=>trusted,getMediaAccessStatus:()=> 'not-determined',askForMediaAccess:async()=>false},globalShortcut:{register:()=>shortcut,isRegistered:()=>shortcut,unregisterAll(){}},Menu:{buildFromTemplate:items=>items,setApplicationMenu(){}}};
 const context={require:name=>name==='electron'?electron:name==='./native/coregraphics.cjs'?{createNativeDriver:()=>driver}:name==='./native/controller.cjs'?{createController:options=>require('../native/controller.cjs').createController({...options,now:()=>time})}:require(name),__dirname:path.resolve(__dirname,'..'),URL,Response,setInterval:()=>++id,clearInterval(){},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:token=>timers.delete(token)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),context);await Promise.resolve();
 const event=()=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
 return {get window(){return window;},call:(name,...args)=>handles.get(name)(event(),...args),rawCall:(name,event,...args)=>handles.get(name)(event,...args),emit:(name,...args)=>listeners.get(name)(event(),...args),rawEmit:(name,event,...args)=>listeners.get(name)(event,...args),tick:ms=>time+=ms,timers,posted,get quit(){return quit;}};
}
test('IPC rejects an unrelated sender or child frame',async()=>{
 const h=await harness();assert.throws(()=>h.rawCall('enable',{sender:{},senderFrame:{url:'gloveflow://app/index.html'}}),/Untrusted/);
 assert.throws(()=>h.rawCall('enable',{sender:h.window.webContents,senderFrame:{url:'gloveflow://app/index.html'}}),/Untrusted/);assert.equal(h.posted.length,0);
});
test('permission handlers allow only local video requests and deny microphone',async()=>{
 const h=await harness();let allowed;
 h.window.permissionRequest(h.window.webContents,'media',value=>allowed=value,{mediaTypes:['video']});assert.equal(allowed,true);
 h.window.permissionRequest(h.window.webContents,'media',value=>allowed=value,{mediaTypes:['audio','video']});assert.equal(allowed,false);
 h.window.permissionRequest({},'media',value=>allowed=value,{mediaTypes:['video']});assert.equal(allowed,false);
 assert.equal(h.window.permissionCheck(h.window.webContents,'media','https://example.com',{mediaType:'video'}),false);
});
test('preview stop emits one string and destroys a renderer that never acknowledges',async()=>{
 const h=await harness();h.call('stop');assert.equal(h.window.messages.length,1);
 const [name,reason,token]=h.window.messages[0];assert.equal(name,'tracking-stopped');assert.equal(typeof reason,'string');assert.equal(typeof token,'number');
 const pending=[...h.timers.values()][0];pending();assert.equal(h.window.destroyed,true);assert.equal(h.quit,1);
});
test('only matching acknowledgement clears the camera stop timeout',async()=>{
 const h=await harness();h.call('stop');const token=h.window.messages[0][2];h.emit('stop-ack',token+1);assert.equal(h.timers.size,1);
 h.emit('stop-ack',token);assert.equal(h.timers.size,0);
});
test('enable is blocked during stop and unavailable emergency shortcut',async()=>{
 const h=await harness();h.call('stop');assert.equal(h.call('enable').enabled,false);
 h.emit('stop-ack',h.window.messages[0][2]);assert.equal(h.call('enable').enabled,true);
 const noShortcut=await harness({shortcut:false});assert.equal(noShortcut.call('enable').enabled,false);assert.equal(noShortcut.posted.length,0);
});
test('stopping enabled control sends one notification and repeated enable is idempotent',async()=>{
 const h=await harness();assert.equal(h.call('enable').enabled,true);assert.equal(h.call('enable').enabled,true);assert.equal(h.window.messages.length,0);
 h.call('stop');assert.equal(h.window.messages.length,1);assert.equal(typeof h.window.messages[0][1],'string');assert.equal(h.posted.length,0);
});
test('live readiness reaches the renderer without rebroadcasting unchanged frames',async()=>{
 const h=await harness();h.call('enable');
 const frame=(mode,scrollDelta=0)=>h.emit('frame',{mode,x:.5,y:.5,click:false,scrollDelta});
 frame('palm');
 assert.equal(h.window.messages.length,1);
 let [channel,status]=h.window.messages[0];
 assert.equal(channel,'control-state');assert.equal(status.enabled,true);assert.equal(status.armed,true);assert.equal(status.scrollReady,false);
 assert.match(status.reason,/control is active/);
 for(let i=0;i<5;i++){h.tick(45);frame('palm');}
 assert.equal(h.window.messages.length,1);
 h.tick(45);frame('none');
 assert.equal(h.window.messages.length,2);assert.equal(h.window.messages[1][1].armed,false);
 h.tick(45);frame('scroll',20);
 assert.equal(h.window.messages.length,3);assert.match(h.window.messages[2][1].reason,/Hold two fingers/);
 for(let i=0;i<4;i++){h.tick(45);frame('scroll',20);}
 assert.equal(h.window.messages.length,4);
 status=h.window.messages[3][1];assert.equal(status.scrollReady,true);assert.equal(status.armed,false);assert.match(status.reason,/scrolling is active/);
 assert.equal(h.posted.length,0,'The recovery frame must not post any native input.');
 h.tick(45);frame('scroll',7);assert.deepEqual(h.posted,[['scroll',7]]);assert.equal(h.window.messages.length,4);
});
test('unrelated senders and child frames cannot produce native input or live status',async()=>{
 const h=await harness();h.call('enable');
 const frame={mode:'point',x:.5,y:.5,click:false,scrollDelta:0};
 for(const sender of [
  {sender:{},senderFrame:h.window.webContents.mainFrame},
  {sender:h.window.webContents,senderFrame:{url:'gloveflow://app/index.html'}}
 ]){
  h.rawEmit('frame',sender,frame);h.tick(45);h.rawEmit('frame',sender,frame);
 }
 assert.equal(h.window.messages.length,0);assert.equal(h.posted.length,0);assert.equal(h.call('status').controller.armed,false);
 h.window.webContents.mainFrame.url='https://example.com/';
 h.emit('frame',frame);assert.equal(h.window.messages.length,0);assert.equal(h.posted.length,0);
});
test('a new control session publishes readiness even when it matches the prior session',async()=>{
 const h=await harness(),frame={mode:'palm',x:null,y:null,click:false,scrollDelta:0};
 h.call('enable');h.emit('frame',frame);
 assert.equal(h.window.messages.filter(message=>message[0]==='control-state').length,1);
 h.call('stop');const stopped=h.window.messages.find(message=>message[0]==='tracking-stopped');
 h.emit('stop-ack',stopped[2]);h.call('enable');h.emit('frame',frame);
 assert.equal(h.window.messages.filter(message=>message[0]==='control-state').length,2);
 assert.equal(h.posted.length,0);
});
test('preload forwards only the control status, without exposing the IPC event',()=>{
 const ipcRenderer=new EventEmitter();let exposed;
 ipcRenderer.send=()=>{};ipcRenderer.invoke=()=>Promise.resolve();
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preload.cjs'),'utf8'),{
  require:name=>{assert.equal(name,'electron');return {ipcRenderer,contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'gloveflow');exposed=value;}}};}
 });
 const received=[];exposed.onControlState((...args)=>received.push(args));
 const status={enabled:true,paused:false,armed:false,scrollReady:true,reason:'Two-finger scrolling is active.',restartRequired:false};
 ipcRenderer.emit('control-state',{sender:{privateCapability:true}},status);
 assert.deepEqual(received,[[status]]);assert.equal(Object.isFrozen(exposed),true);
});
