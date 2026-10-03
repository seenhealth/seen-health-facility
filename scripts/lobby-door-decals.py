"""Window decals of the lobby's sliding doors (photos 2026-10-02), as transparent textures at 1 px per mm.

    python3 scripts/lobby-door-decals.py      # needs pillow; macOS system fonts

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

def decal():
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    # street number, two lines, centred
    for i, line in enumerate(('1839 W', 'Valley Blvd')):
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
    im.save(os.path.join(OUT, 'lobby-door-decal.png'))

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
print('wrote lobby-door-decal.png, lobby-door-stickers.png')
