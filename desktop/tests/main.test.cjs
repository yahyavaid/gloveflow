const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {EventEmitter}=require('node:events');
async function harness({trusted=true,shortcut=true}={}){
 const handles=new Map(),listeners=new Map(),timers=new Map(),posted=[];let id=0,window,quit=0;
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
 const context={require:name=>name==='electron'?electron:name==='./native/coregraphics.cjs'?{createNativeDriver:()=>driver}:name==='./native/controller.cjs'?require('../native/controller.cjs'):require(name),__dirname:path.resolve(__dirname,'..'),URL,Response,setInterval:()=>++id,clearInterval(){},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:token=>timers.delete(token)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),context);await Promise.resolve();
 const event=()=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
 return {get window(){return window;},call:(name,...args)=>handles.get(name)(event(),...args),rawCall:(name,event,...args)=>handles.get(name)(event,...args),emit:(name,...args)=>listeners.get(name)(event(),...args),timers,posted,get quit(){return quit;}};
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
