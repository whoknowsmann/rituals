#!/usr/bin/env python3
"""
Build the pitch deck as a single HTML file from docs/submission/pitch-deck.md.

Each "## Slide N — Title" becomes one 16:9 slide: the lines under
"**On the slide:**" are the slide text; "**Say:**" is dropped (speaker notes
live in the markdown). Fonts are the app's (Fraunces 900 / Figtree) loaded
from node_modules via file:// so the deck matches the product. Print it to
PDF with a browser (the agent does: Page.printToPDF, landscape, 13.333x7.5 in).

  python3 scripts/deck/build.py --out artifacts/deck/rituals-deck.html
"""
from __future__ import annotations

import argparse
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MD = os.path.join(ROOT, 'docs/submission/pitch-deck.md')
FONT_HEAD = os.path.join(ROOT, 'node_modules/@expo-google-fonts/fraunces/900Black/Fraunces_900Black.ttf')
FONT_BODY = os.path.join(ROOT, 'node_modules/@expo-google-fonts/figtree/400Regular/Figtree_400Regular.ttf')
FONT_BODY_BOLD = os.path.join(ROOT, 'node_modules/@expo-google-fonts/figtree/600SemiBold/Figtree_600SemiBold.ttf')

CSS = """
@font-face {{ font-family: 'Fraunces'; src: url('file://{head}'); font-weight: 900; }}
@font-face {{ font-family: 'Figtree'; src: url('file://{body}'); font-weight: 400; }}
@font-face {{ font-family: 'Figtree'; src: url('file://{bold}'); font-weight: 600; }}
@page {{ size: 13.333in 7.5in; margin: 0; }}
html, body {{ margin: 0; padding: 0; background: #121212; }}
.slide {{ width: 13.333in; height: 7.5in; box-sizing: border-box; padding: 0.9in 1.1in; page-break-after: always;
  background: #F4EFE6; color: #1B1A17; font-family: 'Figtree', system-ui, sans-serif; position: relative; overflow: hidden; }}
.slide.dark {{ background: #121212; color: #F4EFE6; }}
.kicker {{ font-family: 'Figtree'; font-weight: 600; font-size: 14pt; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.6; margin-bottom: 0.25in; }}
h1 {{ font-family: 'Fraunces', Georgia, serif; font-weight: 900; font-size: 54pt; line-height: 1.02; letter-spacing: -0.02em; margin: 0 0 0.35in 0; }}
.slide.title h1 {{ font-size: 96pt; margin-bottom: 0.2in; }}
.lines p {{ font-size: 26pt; line-height: 1.3; margin: 0 0 0.16in 0; max-width: 10.4in; }}
.slide.title .lines p {{ font-size: 30pt; }}
.tagline {{ font-family: 'Fraunces', Georgia, serif; font-weight: 900; font-size: 40pt; letter-spacing: -0.01em; color: #2F5D3A; margin-bottom: 0.3in; }}
.slide.dark .tagline {{ color: #C8F560; }}
.foot {{ position: absolute; left: 1.1in; right: 1.1in; bottom: 0.5in; display: flex; justify-content: space-between; font-size: 12pt; opacity: 0.55; }}
.num {{ font-variant-numeric: tabular-nums; }}
"""


def parse(md: str) -> list[dict]:
    slides = []
    for block in re.split(r'^## Slide ', md, flags=re.M)[1:]:
        head, _, rest = block.partition('\n')
        m = re.match(r'(\d+)\s+[—-]\s+(.*)', head.strip())
        if not m:
            continue
        number, title = int(m.group(1)), m.group(2).strip()
        on = rest.split('**On the slide:**', 1)[1].split('**Say:**', 1)[0] if '**On the slide:**' in rest else ''
        lines = [ln.strip() for ln in on.strip().splitlines() if ln.strip()]
        slides.append({'n': number, 'title': title, 'lines': lines})
    return slides


def render(slides: list[dict]) -> str:
    out = ['<!doctype html><html><head><meta charset="utf-8"><title>Rituals — CLOCK IN</title><style>',
           CSS.format(head=FONT_HEAD, body=FONT_BODY, bold=FONT_BODY_BOLD), '</style></head><body>']
    total = len(slides)
    for s in slides:
        is_title = s['n'] == 1
        cls = 'slide title dark' if is_title else ('slide dark' if s['n'] == total else 'slide')
        out.append(f'<section class="{cls}">')
        if is_title:
            name, tag, *rest = s['lines'] + ['', '']
            out.append(f'<h1>{html.escape(name)}</h1><div class="tagline">{html.escape(tag)}</div><div class="lines">')
            for ln in rest:
                if ln: out.append(f'<p>{html.escape(ln)}</p>')
            out.append('</div>')
        else:
            out.append(f'<div class="kicker">{html.escape(s["title"])}</div><div class="lines">')
            first = True
            for ln in s['lines']:
                if first:
                    out.append(f'<h1>{html.escape(ln)}</h1>'); first = False
                else:
                    out.append(f'<p>{html.escape(ln)}</p>')
            out.append('</div>')
        out.append(f'<div class="foot"><span>Rituals · CLOCK IN, the Solana Mobile hackathon · devnet</span><span class="num">{s["n"]} / {total}</span></div>')
        out.append('</section>')
    out.append('</body></html>')
    return '\n'.join(out)


def main() -> int:
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); args = ap.parse_args()
    for f in (FONT_HEAD, FONT_BODY, FONT_BODY_BOLD, MD):
        if not os.path.exists(f): print('missing', f, file=sys.stderr); return 2
    slides = parse(open(MD, encoding='utf-8').read())
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as fh: fh.write(render(slides))
    print(f'{len(slides)} slides -> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
