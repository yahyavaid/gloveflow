import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const target=new URL('../renderer/vendor/',import.meta.url);
await fs.mkdir(new URL('wasm/',target),{recursive:true});
const source=new URL('../node_modules/@mediapipe/tasks-vision/',import.meta.url);
await fs.copyFile(new URL('vision_bundle.mjs',source),new URL('vision_bundle.mjs',target));
for(const file of await fs.readdir(new URL('wasm/',source))){if(/\.(wasm|js)$/.test(file))await fs.copyFile(new URL('wasm/'+file,source),new URL('wasm/'+file,target));}
const modelUrl='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const response=await fetch(modelUrl);if(!response.ok)throw new Error('Could not fetch official model');
const bytes=Buffer.from(await response.arrayBuffer());
await fs.writeFile(new URL('hand_landmarker.task',target),bytes);
await fs.writeFile(new URL('ASSETS.json',target),JSON.stringify({package:'@mediapipe/tasks-vision@0.10.21',modelUrl,modelSha256:crypto.createHash('sha256').update(bytes).digest('hex')},null,2)+'\n');
console.log('Bundled official hand tracking assets; camera processing can run offline.');
