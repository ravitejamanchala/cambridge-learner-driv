"""Repaint the RX-7 texture: yellow -> learner green, remove team decals, UK-style plate. Then embed into one glTF JSON."""
import sys, json, base64, io
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src+'/textures/material_1_baseColor.png').convert('RGBA'); px = im.load()
BODY = (250, 208, 30)
for box in [(386, 348, 407, 367), (403, 411, 423, 431)]:          # door decals
    for x in range(box[0], box[2]):
        for y in range(box[1], box[3]):
            r, g, b, a = px[x, y]
            if not (r > 150 and g > 120 and b < 110): px[x, y] = BODY + (a,)
d = ImageDraw.Draw(im)
d.rectangle((170, 368, 242, 398), fill=(255, 255, 255, 255))      # team logo
GREEN = (26, 124, 82)
for x in range(512):
    for y in range(512):
        r, g, b, a = px[x, y]
        if r > 150 and g > 120 and b < 110 and r >= g:
            f = min(1.25, (r+g)/458)
            px[x, y] = tuple(min(255, int(c*f)) for c in GREEN) + (a,)
d.rectangle((2, 382, 54, 409), fill=(247, 247, 242, 255), outline=(30, 30, 30, 255))
d.rectangle((3, 383, 8, 408), fill=(0, 61, 165, 255))
try: fnt = ImageFont.truetype('DejaVuSans-Bold.ttf', 8)
except OSError: fnt = ImageFont.load_default()
d.text((10, 391), 'CB26 LRN', fill=(15, 15, 15, 255), font=fnt)
buf = io.BytesIO(); im.save(buf, 'PNG'); im.save(out.replace('.json', '_tex.png'))
g = json.load(open(src+'/scene.gltf'))
def uri(p, mime): return 'data:%s;base64,%s' % (mime, base64.b64encode(p).decode())
imgs = []
for i, imgdef in enumerate(g['images']):
    data = buf.getvalue() if i == 1 else open(src+'/'+imgdef['uri'], 'rb').read()
    imgs.append({'uri': uri(data, 'image/png'), 'mimeType': 'image/png'})
g['images'] = imgs
g['buffers'][0]['uri'] = uri(open(src+'/scene.bin', 'rb').read(), 'application/octet-stream')
json.dump(g, open(out, 'w'), separators=(',', ':'))
