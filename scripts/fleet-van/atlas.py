"""Texture atlas (2048 x 2304) for the fleet van, from the photos in sources/fleet-van/photos.

    python scripts/fleet-van/atlas.py work/fleet-van

Each side photo is rectified onto the van's side plane with a homography fitted to the hubs and the roof
line (model metres: z along the van, nose at -z; y up), the rear is near-orthographic, and the front is
mapped band by band in build_van.py. Pixel coordinates below are on the 5712 x 4284 originals; the stored
photos are half size and are scaled back up on load. Licence plates are painted blank.
"""
import json, os, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from homog import H
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(OUT, exist_ok=True)
NAMES = {1: 'front-quarter', 2: 'driver-side', 3: 'rear', 4: 'kerb-side', 5: 'kerb-front-quarter', 6: 'front'}
def photo(n):
    return Image.open(os.path.join(HERE, '../../sources/fleet-van/photos', NAMES[n] + '.jpg')).resize((5712, 4284), Image.BICUBIC)
AW, AH = 2048, 2304
atlas = Image.new('RGB', (AW, AH), (40, 40, 40))
meta = {'size': [AW, AH]}

def warp(n, src, dst, box, size):
    """Rectify photo n: model plane coords (u, v) in box -> image of `size` (u left->right, v top=high)."""
    u0, u1, v0, v1 = box; W, Hh = size
    hm = H(dst, src)
    T = np.array([[(u1 - u0) / W, 0, u0], [0, -(v1 - v0) / Hh, v1], [0, 0, 1]])
    M = hm @ T; M = M / M[2, 2]
    return photo(n).transform((W, Hh), Image.PERSPECTIVE, tuple(M.flatten()[:8]), Image.BICUBIC)

# Sides: z in [-3.25, 3.25], y in [0, 2.65]
SZ = (-3.25, 3.25); SY = (0.0, 2.65)
side_h = 835
left = warp(2, [[953, 2880], [4218, 2778], [5224, 1152], [953, 1068]],
            [[-2.2, 0.375], [1.84, 0.375], [3.15, 2.56], [-2.2, 2.56]], (*SZ, *SY), (AW, side_h))
# kerb side photo has the nose on the right: plane u = -z
right = warp(4, [[1710, 3052], [4962, 2881], [1710, 1223], [4962, 1293]],
             [[-1.84, 0.375], [2.2, 0.375], [-1.84, 2.56], [2.2, 2.56]], (*SZ, *SY), (AW, side_h))
atlas.paste(left, (0, 0)); atlas.paste(right, (0, side_h))
meta['left'] = {'rect': [0, 0, AW, side_h], 'u': ['z', *SZ], 'v': SY}
meta['right'] = {'rect': [0, side_h, AW, side_h], 'u': ['-z', *SZ], 'v': SY}

# Rear: near-orthographic; x in [-1.15, 1.15], y in [0.25, 2.72]
y0 = 2 * side_h
RX = (-1.15, 1.15); RY = (0.25, 2.72)
rear = warp(3, [[1664, 700], [4344, 700], [1664, 3460], [4344, 3460]],
            [[-1, 2.56], [1, 2.56], [-1, 0.5], [1, 0.5]], (*RX, *RY), (589, 632))
d = ImageDraw.Draw(rear)
# blank the licence plate (plate sits left of centre, about x -0.42..-0.08, y 0.73..0.93 measured on the rectified image)
atlas.paste(rear, (0, y0))
meta['rear'] = {'rect': [0, y0, 589, 632], 'u': ['x', *RX], 'v': RY}

# Front: crop the photo around the van; bands map model y -> photo row, with a per-band px/m (display px x4 = original).
FX0, FY0, FX1, FY1 = 1240, 560, 4380, 3640
front = photo(6).crop((FX0, FY0, FX1, FY1)).resize((630, 618), Image.LANCZOS)
fx = 600
atlas.paste(front, (fx, y0))
# (y, row_display, px_per_m_display, centre_x_display)
bands = [(0.33, 893, 339, 697), (0.98, 600, 341, 700), (1.08, 510, 335, 695), (1.26, 455, 305, 700),
         (2.36, 250, 280, 702), (2.58, 165, 247, 688)]
meta['front'] = {'rect': [fx, y0, 630, 618], 'crop': [FX0, FY0, FX1, FY1], 'bands': bands}

# Rim: rear wheel of the driver-side photo, hub (4218, 2778), tyre radius ~255 px
rim = photo(2).crop((4218 - 260, 2778 - 260, 4218 + 260, 2778 + 260)).resize((280, 280), Image.LANCZOS)
atlas.paste(rim, (1240, y0))
meta['rim'] = {'rect': [1240, y0, 280, 280], 'radius_m': 0.375, 'radius_px': 260 * 280 / 520}

# Swatches
def sample(img, box):
    a = np.asarray(img.crop(box)).reshape(-1, 3); return tuple(int(c) for c in np.median(a, 0))
# plain teal: kerb side above the cab door handle (plane u = -z, so z -1.4 sits at u 1.4)
cx = lambda u: int((u + 3.25) / 6.5 * AW); cy = lambda y: int((2.65 - y) / 2.65 * side_h)
rx = lambda x: int((x + 1.15) / 2.3 * 589); ry = lambda y: int((2.72 - y) / 2.47 * 632)
teal = sample(rear, (rx(-0.9), ry(1.12), rx(-0.7), ry(1.0)))
roof_teal = tuple(min(255, int(c * 1.08)) for c in teal)
swatches = {'teal': teal, 'roof': roof_teal, 'black': (32, 34, 35), 'interior': (54, 58, 60), 'floor': (44, 47, 49),
            'seat': (36, 40, 44), 'silver': (178, 182, 184), 'tyre': (26, 27, 28), 'amber': (232, 160, 60),
            'marker': (236, 236, 228), 'chrome': (205, 208, 210), 'dash': (40, 42, 44)}
sw = {}
for i, (k, c) in enumerate(swatches.items()):
    x = 1540 + (i % 4) * 126; y = y0 + (i // 4) * 126
    ImageDraw.Draw(atlas).rectangle([x, y, x + 120, y + 120], fill=c)
    sw[k] = [x + 60, y + 60]
meta['swatch'] = sw
print('teal', teal, 'roof', roof_teal)
for box in [(136, y0 + 430, 222, y0 + 462), (864, y0 + 548, 972, y0 + 616)]:
    ImageDraw.Draw(atlas).rounded_rectangle(box, radius=5, fill=(236, 236, 232), outline=(60, 60, 60), width=2)
atlas.save(os.path.join(OUT, 'atlas.jpg'), quality=88)
json.dump(meta, open(os.path.join(OUT, 'atlas.json'), 'w'), indent=1)
