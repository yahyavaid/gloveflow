const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('gloveflow',Object.freeze({
 status:()=>ipcRenderer.invoke('status'),
 requestAccessibility:()=>ipcRenderer.invoke('request-accessibility'),
 requestCamera:()=>ipcRenderer.invoke('request-camera'),
 enable:()=>ipcRenderer.invoke('enable'),
 pause:paused=>ipcRenderer.invoke('pause',paused),
 stop:()=>ipcRenderer.invoke('stop'),
 frame:frame=>ipcRenderer.send('frame',frame),
 onControlState:callback=>{ipcRenderer.on('control-state',(_event,status)=>callback(status));},
 onStopped:callback=>{ipcRenderer.on('tracking-stopped',(_event,reason,token)=>{callback(reason);ipcRenderer.send('stop-ack',token);});}
}));
