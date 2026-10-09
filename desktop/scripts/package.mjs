import {packager} from '@electron/packager';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
for(const file of ['vision_bundle.mjs','hand_landmarker.task','wasm/vision_wasm_internal.js','wasm/vision_wasm_internal.wasm']){
 try{await fs.access(new URL('../renderer/vendor/'+file,import.meta.url));}catch{throw new Error('Missing hand-tracking assets. Run npm run assets before packaging.');}
}
const {version}=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
const outputs=await packager({dir:'.',out:path.join('release',version),name:'GloveFlow',appBundleId:'com.yahyavaid.gloveflow',appVersion:version,platform:'darwin',arch:'arm64',overwrite:true,asar:false,prune:true,ignore:[/^\/release\//,/^\/tests\//,/^\/scripts\//,/^\/\.git/],extendInfo:{NSCameraUsageDescription:'GloveFlow uses your camera to detect hand gestures locally and control your cursor. Video is never recorded or uploaded.',NSMicrophoneUsageDescription:'GloveFlow does not use the microphone.'},usageDescription:{Camera:'Detect hand gestures locally; no video is recorded or uploaded.'}});
for(const output of outputs){
 execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-','--entitlements','scripts/entitlements.plist',path.join(output,'GloveFlow.app')],{stdio:'inherit'});
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',path.join(output,'GloveFlow.app')],{stdio:'inherit'});
}
console.log(JSON.stringify({outputs}));
