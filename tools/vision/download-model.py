"""Fetch a pinned public model with inherited proxy/CA trust; verify LFS checksum."""
import hashlib,json,pathlib,urllib.request,sys
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
model='CIDAS/clipseg-rd64-refined'
revision='999e0328d9e10b484360c477313983f9afdd7050'
info=json.load(urllib.request.urlopen('https://huggingface.co/api/models/'+model+'/revision/'+revision+'?blobs=true'))
if info['sha']!=revision:raise ValueError('Model revision mismatch')
allowed={'config.json','merges.txt','model.safetensors','preprocessor_config.json','special_tokens_map.json','tokenizer_config.json','vocab.json','README.md'}
for s in info['siblings']:
 name=s['rfilename']
 if name not in allowed:continue
 path=root/name
 if not path.exists():
  with urllib.request.urlopen('https://huggingface.co/'+model+'/resolve/'+revision+'/'+name,timeout=120) as r,open(path.with_suffix(path.suffix+'.partial'),'wb') as f:
   while block:=r.read(1024*1024):f.write(block)
  path.with_suffix(path.suffix+'.partial').rename(path)
 digest=hashlib.sha256(path.read_bytes()).hexdigest();expected=s.get('lfs',{}).get('sha256')
 if expected and digest!=expected:raise ValueError('Checksum mismatch: '+name)
 print(name,path.stat().st_size)
(root/'source-receipt.json').write_text(json.dumps({'model':model,'revision':revision,'license':info.get('cardData',{}).get('license')},indent=2))
