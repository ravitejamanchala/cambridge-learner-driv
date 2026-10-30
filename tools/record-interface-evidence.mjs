import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const out='docs/evidence/interface', source='test-results/interface';
fs.mkdirSync(out,{recursive:true});
execFileSync(process.execPath,['tests/interface-browser.mjs'],{env:{...process.env,RECORD_UI:'1'},stdio:'inherit'});
const result=JSON.parse(fs.readFileSync(source+'/result.json','utf8'));
for(const name of ['desktop','mobile']){
  const start=result.videoMarks[name],duration=Math.min(55,result.videoMarks[name+'End']-start);
  execFileSync('ffmpeg',['-y','-v','error','-ss',String(start),'-i',result.video,'-t',String(duration),'-vf','scale=1120:-2','-c:v','libx264','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,name+'.mp4')],{stdio:'inherit'});
}
for(const name of ['home-desktop','course-desktop','settings-desktop','home-390-844','home-844-390','lesson-mobile','settings-mobile','garage-mobile','routes-desktop'])fs.copyFileSync(source+'/'+name+'.png',out+'/'+name+'.png');
delete result.video;delete result.videoStartMs;
fs.writeFileSync(out+'/checks.json',JSON.stringify(result,null,2)+'\n');
console.log('Recorded interface evidence in '+out);
