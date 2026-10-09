import {GestureEngine} from './gestures.js';
import {PoseHold} from './interaction.js';
import {FilesetResolver,HandLandmarker} from './vendor/vision_bundle.mjs';
const $=id=>document.getElementById(id),api=window.gloveflow,engine=new GestureEngine(),hold=new PoseHold();
let stream=null,model=null,frameId=0,cameraRun=0,enabled=false,paused=false,enabling=false,pausing=false,lastInference=0,lastVideoTime=-1;
const message=text=>{if($('message').textContent!==text)$('message').textContent=text;};
function showControlState(status){
 if(!enabled||!status.enabled)return;
 paused=status.paused;renderMode();
 message(paused?'Cursor paused. Hold an open palm for one second to resume.':status.reason);
}
api.onControlState(showControlState);
function renderMode(){
 $('mode').textContent=enabled?(paused?'CURSOR PAUSED':'MAC CONTROL ON'):stream?'CAMERA PREVIEW':'READY';
 $('control').disabled=!stream||enabled||enabling;$('control').textContent=enabled?'Mac control enabled':'Enable Mac control';
 $('tracking-actions').hidden=!stream;$('pause').disabled=!enabled;$('pause').textContent=paused?'Resume cursor':'Pause cursor';
}
async function refreshStatus(){
 const status=await api.status();
 $('permissions').hidden=status.trusted;
 if(!status.emergencyShortcut){message('The emergency shortcut is in use. Close its other app and relaunch GloveFlow before enabling control.');$('control').disabled=true;}
 return status;
}
function stopLocal(reason='Camera and cursor stopped.'){
 cameraRun++;cancelAnimationFrame(frameId);stream?.getTracks().forEach(track=>track.stop());stream=null;
 model?.close();model=null;$('video').srcObject=null;$('empty').hidden=false;
 engine.reset();hold.reset();enabled=false;paused=false;enabling=false;pausing=false;lastVideoTime=-1;lastInference=0;
 $('camera-state').textContent='Camera off';$('camera').disabled=false;$('camera').textContent='Start camera';$('gesture').textContent='No hand detected';$('preview-pointer').hidden=true;renderMode();message(reason);
}
api.onStopped(reason=>stopLocal(typeof reason==='string'?reason:'Camera and cursor stopped.'));
async function startCamera(){
 stopLocal();const run=++cameraRun;$('camera').disabled=true;message('Preparing local hand tracking…');
 try{
  const status=await refreshStatus();
  if(status.camera!=='granted'&&!await api.requestCamera())throw new Error('Camera access was declined. Allow GloveFlow in macOS Camera settings, then reopen it.');
  if(run!==cameraRun)return;
  const files=await FilesetResolver.forVisionTasks('gloveflow://app/vendor/wasm');
  const loaded=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'gloveflow://app/vendor/hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.65,minHandPresenceConfidence:.65,minTrackingConfidence:.65});
  if(run!==cameraRun){loaded.close();return;}model=loaded;
  const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},facingMode:'user'}});
  if(run!==cameraRun){media.getTracks().forEach(track=>track.stop());return;}
  stream=media;$('video').srcObject=media;await $('video').play();if(run!==cameraRun)return;
  $('empty').hidden=true;$('camera-state').textContent='Camera on · local processing';$('camera').disabled=false;$('camera').textContent='Restart camera';
  message('Preview mode. Point with one finger, then enable Mac control when ready.');renderMode();
  media.getVideoTracks()[0].addEventListener('ended',()=>{if(run===cameraRun){api.stop();stopLocal('Camera disconnected. Start it again when ready.');}});
  frameId=requestAnimationFrame(track);
 }catch(error){if(run!==cameraRun)return;await api.stop();stopLocal(error.message||'Could not start tracking. Check camera access and retry.');}
}
async function togglePause(next){
 if(!enabled||pausing)return;
 const run=cameraRun;pausing=true;
 try{
  const status=await api.pause(next);if(run!==cameraRun||!status.enabled||!enabled)return;
  engine.reset();hold.reset();showControlState(status);
 }finally{if(run===cameraRun)pausing=false;}
}
function track(now){
 if(!stream||!model)return;
 if($('video').readyState>=2&&$('video').currentTime!==lastVideoTime&&now-lastInference>=45){
  lastVideoTime=$('video').currentTime;lastInference=now;
  try{
   const gesture=engine.update(model.detectForVideo($('video'),now).landmarks?.[0],now);
   $('gesture').textContent=gesture.mode==='none'?'No hand detected':gesture.mode==='pinch'?'Pinch':gesture.mode==='scroll'?'Two fingers':gesture.mode==='fist'?'Fist':gesture.mode==='palm'?'Open palm':gesture.mode==='point'?'Pointing':'Resting';
   const pointer=$('preview-pointer');pointer.hidden=!['point','pinch','scroll'].includes(gesture.mode);
   if(!pointer.hidden){pointer.style.left=`${8+gesture.x*84}%`;pointer.style.top=`${8+gesture.y*65}%`;}
   if(enabled){
    const expected=paused?'palm':'fist';
    if(hold.update(gesture.mode,now,expected))void togglePause(!paused);
    // Send only interpreted actions; no camera frame or landmarks leave the renderer.
    api.frame({mode:gesture.mode,x:gesture.x??null,y:gesture.y??null,click:!!gesture.click,scrollDelta:gesture.scrollDelta??0});
   }
  }catch{api.stop();stopLocal('Tracking interrupted. The cursor is off. Restart the camera to try again.');return;}
 }
 frameId=requestAnimationFrame(track);
}
$('camera').addEventListener('click',async()=>{await api.stop();await startCamera();});
$('control').addEventListener('click',async()=>{
 if(enabling||enabled||!stream)return;const run=cameraRun;enabling=true;renderMode();
 try{
  const status=await refreshStatus();if(run!==cameraRun||!stream||!status.emergencyShortcut)return;
  const result=await api.enable();
  if(run!==cameraRun||!stream){if(result.enabled)await api.stop();return;}
  enabled=result.enabled;paused=false;engine.reset();hold.reset();message(result.reason);
 }finally{if(run===cameraRun){enabling=false;renderMode();}}
});
$('pause').addEventListener('click',()=>togglePause(!paused));
$('stop').addEventListener('click',async()=>{await api.stop();stopLocal('Camera and cursor stopped.');});
$('accessibility').addEventListener('click',async()=>{await api.requestAccessibility();message('Approve GloveFlow in macOS Accessibility settings, then return and choose Check again.');});
$('recheck').addEventListener('click',async()=>{const status=await refreshStatus();message(status.trusted?'Accessibility access is ready. Preview your hand before enabling control.':'Accessibility access is still off. Enable GloveFlow in macOS settings.');});
$('smoothing').addEventListener('input',event=>{engine.smoothing=Number(event.target.value)/100;$('smooth-label').textContent=`${event.target.value}%`;});
$('sensitivity').addEventListener('input',event=>{engine.threshold=Number(event.target.value)/100;engine.reset();});
window.addEventListener('beforeunload',()=>{stream?.getTracks().forEach(track=>track.stop());model?.close();});
const initial=await refreshStatus();
// First launch remains a permission setup screen. Once camera access is granted,
// opening this app starts the local preview; desktop control still needs Enable.
if(initial.camera==='granted')void startCamera();
