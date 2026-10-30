"""Experimental text-guided segmentation of independently licensed orthophotos.
Outputs review proposals, never ground truth, learner grades or automatic edits.
"""
import argparse, hashlib, json, pathlib, datetime, os
import numpy as np
from PIL import Image

PROMPTS = {
    "road_surface": "the paved road surface",
    "lane_marking": "white lane markings painted on the road",
    "yellow_box": "a yellow crosshatched box junction painted on the road",
    "keep_clear": "the words KEEP CLEAR painted on the road",
    "parking_bay": "white parking bay markings painted on the road",
    "arrow": "a direction arrow painted on the road",
}

def validate_manifest(m):
    s=m.get('source',{}); b=m.get('bounds',[])
    if not all(s.get(k) for k in ['provider','license','attribution','capturedAt']):
        raise ValueError('Record source provider, license, attribution and capture date')
    if s.get('allowsDerivedData') is not True:
        raise ValueError('Source must permit derived-data extraction')
    if m.get('crs')!='EPSG:4326' or len(b)!=4 or not all(isinstance(v,(int,float)) and np.isfinite(v) for v in b):
        raise ValueError('Use EPSG:4326 bounds [west,south,east,north] for a north-up orthophoto')
    if not(-180<=b[0]<b[2]<=180 and -85<=b[1]<b[3]<=85):raise ValueError('Invalid geographic bounds')
    if m.get('northUpOrthophoto') is not True:raise ValueError('Street photos require camera calibration; they are not north-up orthophotos')
    return m

def vectorize(scores, manifest, width, height, threshold=.6):
    import cv2
    west,south,east,north=manifest['bounds']; features=[]
    for kind,probability in scores.items():
        mask=(probability>=threshold).astype('uint8')*255
        contours,hierarchy=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
        if hierarchy is None:continue
        def ring(c):
            points=cv2.approxPolyDP(c,.7,True).reshape(-1,2)
            r=[[west+(float(x)+.5)/width*(east-west),north-(float(y)+.5)/height*(north-south)] for x,y in points]
            return r+[r[0]] if len(r)>=3 else None
        for i,c in enumerate(contours):
            if hierarchy[0][i][3]>=0 or cv2.contourArea(c)<12:continue
            outer=ring(c)
            if not outer:continue
            holes=[];child=hierarchy[0][i][2]
            while child>=0:
                h=ring(contours[child])
                if h:holes.append(h)
                child=hierarchy[0][child][0]
            selected=np.zeros_like(mask);cv2.drawContours(selected,contours,i,1,-1)
            for h in range(len(contours)):
                if hierarchy[0][h][3]==i:cv2.drawContours(selected,contours,h,0,-1)
            value=float(probability[selected.astype(bool)].mean())
            features.append({'type':'Feature','id':f'{kind}:{i}','geometry':{'type':'Polygon','coordinates':[outer,*holes]},'properties':{'kind':kind,'status':'proposal','score':value,'scoreCalibrated':False,'verified':False}})
    return features

def main():
    import torch
    p=argparse.ArgumentParser();p.add_argument('image');p.add_argument('manifest');p.add_argument('--model',required=True,help='Local pinned CIDAS/clipseg-rd64-refined model directory');p.add_argument('--output',required=True);p.add_argument('--threshold',type=float,default=.6);args=p.parse_args()
    os.environ.setdefault('HF_HOME',str(pathlib.Path(args.model)/'.cache'))
    from transformers import CLIPSegProcessor,CLIPSegForImageSegmentation
    if not .1<=args.threshold<=.99:raise ValueError('Threshold must be between .1 and .99')
    m=validate_manifest(json.loads(pathlib.Path(args.manifest).read_text()));image=Image.open(args.image).convert('RGB');w,h=image.size
    if w*h>4_000_000 or w<32 or h<32:raise ValueError('Use bounded orthophoto crops between 32 pixels and 4 megapixels')
    # CLIPSeg operates at 352px. Never present upsampling as new image detail.
    processor=CLIPSegProcessor.from_pretrained(args.model,local_files_only=True)
    model=CLIPSegForImageSegmentation.from_pretrained(args.model,local_files_only=True,use_safetensors=True).eval();torch.set_num_threads(4)
    scores={}
    with torch.inference_mode():
        for kind,prompt in PROMPTS.items():
            values=processor(text=[prompt],images=[image],return_tensors='pt')
            logits=model(**values,interpolate_pos_encoding=True).logits.reshape(1,1,352,352)
            scores[kind]=torch.nn.functional.interpolate(logits,size=(h,w),mode='bilinear',align_corners=False).sigmoid()[0,0].cpu().numpy()
    model_file=pathlib.Path(args.model)/'model.safetensors'
    receipt={'type':'FeatureCollection','schemaVersion':1,'source':m['source'],'bounds':m['bounds'],'imageSha256':hashlib.sha256(pathlib.Path(args.image).read_bytes()).hexdigest(),'model':{'id':'CIDAS/clipseg-rd64-refined','license':'Apache-2.0','weightsSha256':hashlib.sha256(model_file.read_bytes()).hexdigest()},'georeference':{'crs':'EPSG:4326','northUpOrthophoto':True,'registrationVerified':False},'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'threshold':args.threshold,'accepted':False,'limitations':['Uncalibrated zero-shot model, not trained/validated for UK road marking accuracy','Small/faded/occluded markings may be missed or hallucinated','Class masks may overlap; proposals require independent evidence before application','Geographic registration is supplied by the manifest and is not verified by the model'],'features':vectorize(scores,m,w,h,args.threshold)}
    # Exclusive create: each run is a new review artifact.
    with open(args.output,'x') as f:json.dump(receipt,f,indent=2)
    print(json.dumps({'output':args.output,'proposals':len(receipt['features']),'accepted':False}))

if __name__=='__main__':main()
