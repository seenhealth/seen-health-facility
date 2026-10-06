"""Window decals of the lobby's sliding doors (photos 2026-10-02), as transparent textures at 1 px per mm.

    python3 scripts/lobby-door-decals.py      # needs pillow; macOS system fonts

Also writes the wall signs beside the lobby and the staff entrance's door decals (rear_door).

lobby-door-decal.png: the right-hand leaf's upper glass, all white vinyl: the street number, the Seen Health wordmark
(SeenCentral's public/branding/seen-wordmark.svg, rendered white to lobby-door-assets/seen-wordmark-white.png) with 见心颐养, the center's name and address, phone numbers, opening hours and the no-smoking / no-firearms
lines. The door shows the old name 见康颐养 and mark; this uses the current ones (见心颐养, the four-petal mark).
lobby-door-stickers.png: the left-hand leaf's upper glass, the door maker's STAND CLEAR label and a NO
SOLICITING / THANK YOU sticker.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'reference', 'photos')
WORDMARK = os.path.join(HERE, 'lobby-door-assets', 'seen-wordmark-white.png')
W, H = 680, 960   # upper glass of one leaf: 0.68 x 0.96 m
HN = '/System/Library/Fonts/HelveticaNeue.ttc'
AV = '/System/Library/Fonts/Avenir Next.ttc'
PF = next((os.path.join(r, f) for r, _, fs in os.walk('/System/Library/AssetsV2') for f in fs if f == 'PingFang.ttc'),
          '/System/Library/Fonts/Hiragino Sans GB.ttc')

def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)
WHITE = (246, 247, 243, 255)
MINT = (190, 228, 210, 255)
bold = lambda s: font(HN, s, 1)
av = lambda s: font(AV, s, 7)
av_b = lambda s: font(AV, s, 2)
pf = lambda s: font(PF, s, 3)
pf_b = lambda s: font(PF, s, 7)

def mixed(draw, x, y, parts, fill=WHITE):
    """Draw latin and CJK runs on one baseline-ish line: parts are (text, font)."""
    for text, f in parts:
        draw.text((x, y), text, font=f, fill=fill)
        x += draw.textlength(text, font=f)
    return x

def decal(street=True, name='lobby-door-decal.png'):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    # street number, two lines, centred (left off the staff entrance's left-hand leaf)
    for i, line in enumerate(('1839 W', 'Valley Blvd') if street else ()):
        f = bold(92)
        d.text(((W - d.textlength(line, font=f)) / 2, 22 + i * 102), line, font=f, fill=WHITE)
    # the wordmark (mark + SEEN / HEALTH), 见心颐养 beside it
    mark = Image.open(WORDMARK).convert('RGBA')
    mark = mark.resize((270, round(270 * mark.height / mark.width)), Image.LANCZOS)
    im.alpha_composite(mark, (58, 262))
    d.text((352, 284), '见心颐养', font=pf_b(40), fill=WHITE)
    y = 384
    d.text((60, y), 'Seen Health San Gabriel Valley', font=av_b(27), fill=WHITE); y += 36
    for line in ('1839 W Valley Blvd', 'Alhambra, CA 91803'):
        d.text((60, y), line, font=av(27), fill=WHITE); y += 34
    y += 22
    mixed(d, 60, y, [('Phone Numbers ', av_b(27)), ('联系电话:', pf_b(25))]); y += 36
    for line in ('(626) 563-0588', '1-(855) 586-7336(SEEN)'):
        d.text((60, y), line, font=av(27), fill=WHITE); y += 34
    y += 22
    mixed(d, 60, y, [('Hours of Operation ', av_b(27)), ('营业时间', pf_b(25))]); y += 36
    d.text((60, y), 'Clinic and PACE:', font=av_b(27), fill=WHITE); y += 36
    for text, f in (('Monday - Friday: 8:00 A.M. to 5:00 P.M.', av(25)), ('星期一至星期五 上午8:00至下午5:00', pf(24)),
                    ('Closed Saturday and Sunday', av(25)), ('周六周日休息', pf(24))):
        d.text((60, y), text, font=f, fill=WHITE); y += 34
    y += 26
    for en, cn in (('NO SMOKING ', '禁止吸烟'), ('NO FIREARMS ', '禁止持枪')):
        mixed(d, 60, y, [(en, av_b(27)), (cn, pf_b(25))]); y += 36
    im.save(os.path.join(OUT, name))

def stickers():
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    # STAND CLEAR: the operator maker's light-blue label across the middle of the glass
    x0, y0, x1, y1 = 190, 470, 490, 545
    d.rounded_rectangle((x0, y0, x1, y1), 8, fill=(44, 163, 198, 255))
    d.text((x0 + 16, y0 + 8), 'STAND CLEAR', font=av(38), fill=(236, 248, 250, 255))
    d.text((x0 + 18, y1 - 22), 'ASSA ABLOY', font=av_b(13), fill=(226, 244, 248, 255))
    # NO SOLICITING / THANK YOU near the lower corner by the meeting stile
    x0, y0, x1, y1 = 462, 830, 652, 935
    d.rounded_rectangle((x0, y0, x1, y1), 10, fill=(18, 18, 18, 230), outline=WHITE, width=4)
    t = 'NO SOLICITING'; f = bold(21)
    d.text(((x0 + x1 - d.textlength(t, font=f)) / 2, y0 + 16), t, font=f, fill=WHITE)
    d.line((x0 + 18, y0 + 58, x1 - 18, y0 + 58), fill=WHITE, width=3)
    t = 'THANK YOU'; f = bold(17)
    d.text(((x0 + x1 - d.textlength(t, font=f)) / 2, y0 + 68), t, font=f, fill=WHITE)
    im.save(os.path.join(OUT, 'lobby-door-stickers.png'))

decal(); stickers()
# the staff entrance's left-hand leaf: the same information block without the street number
decal(street=False, name='rear-door-left.png')
print('wrote lobby-door-decal.png, lobby-door-stickers.png, rear-door-left.png')


def wall_signs():
    """Signs on the stucco beside the entrance (photos 2026-10-03), at 2 px per mm."""
    # No-smoking notice between the windows: white plate, red lettering, a red band at the foot.
    w, h = 560, 400
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    red = (190, 32, 40, 255)
    d.rounded_rectangle((0, 0, w - 1, h - 1), 18, fill=(250, 250, 247, 255))
    d.rectangle((22, 22, w - 23, h - 23), outline=red, width=4)
    def centred(y, text, f, fill):
        d.text(((w - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)
    centred(36, 'NO', bold(78), red)
    centred(116, 'SMOKING', bold(84), red)
    centred(214, 'WITHIN 25 FEET OF', font(HN, 34, 0), red)
    centred(254, 'BUILDING ENTRANCE', font(HN, 34, 0), red)
    d.rectangle((26, 300, w - 27, h - 27), fill=red)
    centred(306, 'PLEASE DO NOT THROW', bold(30), (255, 255, 255, 255))
    centred(340, 'BUTTS ON GROUND', bold(30), (255, 255, 255, 255))
    im.save(os.path.join(OUT, 'lobby-no-smoking.png'))
    # Accessible-entrance plate beside the door: the symbol of access in white on a grey plate.
    n = 256
    im = Image.new('RGBA', (n, n), (112, 115, 118, 255)); d = ImageDraw.Draw(im)
    W = (246, 246, 244, 255)
    def stroke(pts, width):
        d.line(pts, fill=W, width=width, joint='curve')
        for x, y in pts:
            d.ellipse((x - width / 2, y - width / 2, x + width / 2, y + width / 2), fill=W)
    d.ellipse((104 - 20, 48 - 20, 104 + 20, 48 + 20), fill=W)
    stroke([(100, 82), (100, 150), (160, 150), (184, 204), (212, 204)], 22)
    stroke([(100, 108), (148, 108)], 16)
    d.arc((112 - 58, 176 - 58, 112 + 58, 176 + 58), -48, 228, fill=W, width=16)
    im.save(os.path.join(OUT, 'lobby-access-sign.png'))

wall_signs()
print('wrote lobby-no-smoking.png, lobby-access-sign.png')

def rear_door():
    """The staff entrance's glass double door on the wing's east face (photo 2026-10-05): the right-hand leaf's texture,
    covering the glass from 0.1 m to 2.26 m above the landing (0.68 x 2.16 m at 1 px per mm; row 0 is the top).

    rear-door-right.png (the right-hand leaf as you face the door, model −z): the street number in large white letters at
    the top, STAFF ENTRANCE ONLY / 员工入口 at chest height and a NO SOLICITING / THANK YOU sticker by the meeting stile.
    The left-hand leaf (+z) carries rear-door-left.png: the lobby decal's information block without the street number.
    """
    w, h = 680, 2160
    top = 2.26
    row = lambda y_m: round((top - y_m) * 1000)  # height above the landing in metres -> texture row
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    def centred(y, text, f, fill=WHITE):
        d.text(((w - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)
    f = bold(112)
    centred(row(2.19), '1839 W', f)
    centred(row(2.07), 'Valley Blvd', f)
    y = row(1.45)
    for line in ('STAFF', 'ENTRANCE', 'ONLY'):
        centred(y, line, av_b(54)); y += 58
    centred(y + 2, '员工入口', pf_b(52))
    x0, y0 = 500, row(1.10)
    x1, y1 = x0 + 165, y0 + 72
    d.rounded_rectangle((x0, y0, x1, y1), 8, fill=(18, 18, 18, 230), outline=WHITE, width=3)
    t = 'NO SOLICITING'; f = bold(19)
    d.text(((x0 + x1 - d.textlength(t, font=f)) / 2, y0 + 10), t, font=f, fill=WHITE)
    d.line((x0 + 14, y0 + 40, x1 - 14, y0 + 40), fill=WHITE, width=2)
    t = 'THANK YOU'; f = bold(14)
    d.text(((x0 + x1 - d.textlength(t, font=f)) / 2, y0 + 47), t, font=f, fill=WHITE)
    im.save(os.path.join(OUT, 'rear-door-right.png'))

rear_door()
print('wrote rear-door-right.png')
