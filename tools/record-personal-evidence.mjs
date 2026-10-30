import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const out='docs/evidence/personal-routes',videoDir='test-results/personal-routes/video';fs.mkdirSync(out,{recursive:true});
const env={...process.env,RECORD_ROUTES:'1',ROUTE_TEST_PORT:process.env.ROUTE_TEST_PORT||'8806'};
execFileSync(process.execPath,['tests/personal-routes-browser.mjs'],{env,stdio:'inherit'});
execFileSync(process.execPath,['tests/modal-layout-browser.mjs'],{env,stdio:'inherit'});
const files=fs.readdirSync(videoDir).filter(f=>f.endsWith('.webm')).sort((a,b)=>fs.statSync(path.join(videoDir,b)).mtimeMs-fs.statSync(path.join(videoDir,a)).mtimeMs),video=path.join(videoDir,files[0]);
const marks=JSON.parse(fs.readFileSync('test-results/personal-routes/video-marks.json')),names=['route-flow','route-drive','course-voice','graded-mock'];
for(let i=0;i<names.length;i++){const name=names[i],start=Math.max(0,(marks[name]||0)-.5),duration=Math.min(55,(marks[names[i+1]]??marks.end)-start+1);execFileSync('ffmpeg',['-y','-v','error','-ss',String(start),'-i',video,'-t',String(duration),'-vf','scale=960:-2','-c:v','libx264','-crf','26','-pix_fmt','yuv420p','-movflags','+faststart',out+'/'+name+'.mp4'],{stdio:'inherit'});}
for(const name of ['create-desktop','create-mobile','drive','next-section','course-road-lesson','graded-mock-result'])fs.copyFileSync('test-results/personal-routes/'+name+'.png',out+'/'+name+'.png');
for(const [file,name]of[['courseSheet','course-list'],['courseSheet-detail','course-detail'],['settingsSheet','settings']])fs.copyFileSync('test-results/modals/390-844-'+file+'.png',out+'/'+name+'.png');
console.log('Updated evidence in '+out+'; captions and provider-fixture disclosure are in README.md.');
