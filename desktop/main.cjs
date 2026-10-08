const {app,BrowserWindow,ipcMain,protocol,net,systemPreferences,globalShortcut,Menu}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createNativeDriver}=require('./native/coregraphics.cjs');
const {createController}=require('./native/controller.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'gloveflow',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let window,controller,heartbeat,stopAckTimer,stopSequence=0,waitingForStopAck=false;
const origin='gloveflow://app';
const validSender=event=>window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame.url.startsWith(origin+'/');
function notifyStopped(reason){
 if(!window||window.isDestroyed())return;
 const token=++stopSequence;waitingForStopAck=true;clearTimeout(stopAckTimer);window.webContents.send('tracking-stopped',reason,token);
 // If inference hangs, a renderer message cannot release camera capture.
 // Destroy the window if it fails to acknowledge stopping within one second.
 stopAckTimer=setTimeout(()=>{if(window&&!window.isDestroyed())window.destroy();},1000);
}
function stop(reason='Stopped'){const wasEnabled=controller?.status().enabled;controller?.stop(reason);if(!wasEnabled)notifyStopped(reason);}
function trustedHandler(channel,handler){ipcMain.handle(channel,(event,...args)=>{if(!validSender(event))throw new Error('Untrusted request.');return handler(...args);});}
app.whenReady().then(()=>{
 const rendererRoot=path.join(__dirname,'renderer');
 protocol.handle('gloveflow',request=>{
  try{
   const url=new URL(request.url);
   if(url.host!=='app')return new Response('Not found',{status:404});
   const asset=path.resolve(rendererRoot,'.'+decodeURIComponent(url.pathname));
   if(!asset.startsWith(rendererRoot+path.sep))return new Response('Not found',{status:404});
   return net.fetch(pathToFileURL(asset).href);
  }catch{return new Response('Bad request',{status:400});}
 });
 const driver=createNativeDriver();
 controller=createController({driver,isTrusted:()=>systemPreferences.isTrustedAccessibilityClient(false),onStop:status=>{
  notifyStopped(status.reason);
 }});
 window=new BrowserWindow({width:480,height:780,minWidth:440,minHeight:680,title:'GloveFlow',backgroundColor:'#f3f5fa',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(url!==origin+'/index.html')event.preventDefault();});
 window.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>{
  callback(contents===window.webContents&&permission==='media'&&details.mediaTypes?.length===1&&details.mediaTypes[0]==='video'&&contents.getURL()===origin+'/index.html');
 });
 window.webContents.session.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>contents===window.webContents&&permission==='media'&&requestingOrigin===origin&&details.mediaType==='video');
 trustedHandler('status',()=>({trusted:systemPreferences.isTrustedAccessibilityClient(false),camera:systemPreferences.getMediaAccessStatus('camera'),controller:controller.status(),emergencyShortcut:globalShortcut.isRegistered('CommandOrControl+Shift+G')}));
 trustedHandler('request-accessibility',()=>({trusted:systemPreferences.isTrustedAccessibilityClient(true)}));
 trustedHandler('request-camera',()=>systemPreferences.askForMediaAccess('camera'));
 trustedHandler('enable',()=>{if(waitingForStopAck)return {enabled:false,reason:'Camera is stopping. Try again after it has stopped.'};if(controller.status().enabled)return controller.status();if(!globalShortcut.isRegistered('CommandOrControl+Shift+G'))return {enabled:false,reason:'Emergency shortcut unavailable. Restart GloveFlow after closing its other app.'};return controller.enable();});
 trustedHandler('pause',paused=>{if(typeof paused!=='boolean')throw new Error('Invalid pause state');return controller.setPaused(paused);});
 trustedHandler('stop',()=>{stop('Stopped by you');return controller.status();});
 ipcMain.on('stop-ack',(event,token)=>{if(validSender(event)&&token===stopSequence){clearTimeout(stopAckTimer);waitingForStopAck=false;}});
 ipcMain.on('frame',(event,frame)=>{if(!validSender(event))return;controller.handleFrame(frame);});
 heartbeat=setInterval(()=>controller.checkHeartbeat(),100);
 if(!globalShortcut.register('CommandOrControl+Shift+G',()=>stop('Emergency stop'))){
  // Starting is gated in the renderer if this shortcut is unavailable.
 }
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'GloveFlow',submenu:[{label:'Stop camera and cursor',accelerator:'CommandOrControl+Shift+G',click:()=>stop('Emergency stop')},{type:'separator'},{role:'quit'}]},{label:'Edit',submenu:[{role:'copy'},{role:'paste'},{role:'selectAll'}]}]));
 window.webContents.on('render-process-gone',()=>{controller.stop('Camera process ended');app.quit();});
 window.on('unresponsive',()=>{controller.stop('App became unresponsive');if(!window.isDestroyed())window.destroy();});
 window.on('closed',()=>{controller.stop('App closed');window=null;app.quit();});
 window.loadURL(origin+'/index.html');
});
app.on('before-quit',()=>{clearInterval(heartbeat);clearTimeout(stopAckTimer);controller?.stop('App closed');globalShortcut.unregisterAll();});
app.on('window-all-closed',()=>app.quit());
