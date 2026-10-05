#!/usr/bin/env python3
"""
Render the Rituals demo video from real phone recordings + caption cards.

No installs: uses the bundled ffmpeg (~/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin)
and the app's own fonts from node_modules (Fraunces 900 for headlines, Figtree
for body), so captions match the app.

A shot list is a JSON array of segments, rendered in order and concatenated:

  {"kind": "clip", "src": "artifacts/video/run.mp4", "start": 12.0, "end": 20.0,
   "speed": 1.0, "head": "One approval.", "body": "Create, stake every week,\nactivate — in one tap.",
   "note": "Seed Vault Wallet · Devnet"}
  {"kind": "card", "dur": 3.0, "head": "Show up, or pay up.", "body": "Rituals"}

Layout (1920x1080): dark canvas, the phone (1200x2670 screen recording) scaled
to 1000 px tall on the left third, text on the right. Speed > 1 compresses the
wait ("Week 1 opens in 1:58") and is labelled by the caller in `note`.

  python3 scripts/video/render.py --shots docs/submission/shots.json --out artifacts/video/rituals-demo.mp4
  python3 scripts/video/render.py --shots ... --out ... --frame 7.5   # also dump a PNG at t=7.5 s
"""
from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FFMPEG = os.path.expanduser('~/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg')
FFPROBE = os.path.expanduser('~/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffprobe')
FONT_HEAD = os.path.join(ROOT, 'node_modules/@expo-google-fonts/fraunces/900Black/Fraunces_900Black.ttf')
FONT_BODY = os.path.join(ROOT, 'node_modules/@expo-google-fonts/figtree/400Regular/Figtree_400Regular.ttf')
FONT_BODY_BOLD = os.path.join(ROOT, 'node_modules/@expo-google-fonts/figtree/600SemiBold/Figtree_600SemiBold.ttf')

W, H, FPS = 1920, 1080, 30
BG = '0x121212'          # app night background, close enough for a canvas
INK = '0xF4EFE6'         # warm paper white (app text on dark)
MUTED = '0x9A958C'
LIME = '0xC8F560'        # the app's "chosen" lime
PHONE_H = 1000
PHONE_X = 200
TEXT_X = 760


def esc(text: str) -> str:
    """Escape for drawtext: backslash, colon, quote, percent; keep real newlines."""
    return (text.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")
            .replace('%', '\\%').replace(',', '\\,'))


def text_filters(seg: dict) -> str:
    parts = []
    head = seg.get('head'); body = seg.get('body'); note = seg.get('note')
    y = 380
    if head:
        parts.append(f"drawtext=fontfile={FONT_HEAD}:text='{esc(head)}':fontcolor={INK}:fontsize=74:x={TEXT_X}:y={y}:line_spacing=6")
        y += 74 * (head.count('\n') + 1) + 40
    if body:
        parts.append(f"drawtext=fontfile={FONT_BODY}:text='{esc(body)}':fontcolor={INK}:fontsize=40:x={TEXT_X}:y={y}:line_spacing=12")
        y += 52 * (body.count('\n') + 1) + 30
    if note:
        parts.append(f"drawtext=fontfile={FONT_BODY_BOLD}:text='{esc(note)}':fontcolor={LIME}:fontsize=30:x={TEXT_X}:y={y}")
    return ','.join(parts)


def render_segment(seg: dict, out_path: str) -> None:
    kind = seg.get('kind', 'clip')
    if kind == 'card':
        dur = float(seg['dur'])
        vf = f"[0:v]{text_filters(seg)}[v]" if text_filters(seg) else "[0:v]copy[v]"
        cmd = [FFMPEG, '-y', '-loglevel', 'error',
               '-f', 'lavfi', '-i', f'color=c={BG}:s={W}x{H}:r={FPS}:d={dur}',
               '-f', 'lavfi', '-i', f'anullsrc=r=48000:cl=stereo:d={dur}',
               '-filter_complex', vf, '-map', '[v]', '-map', '1:a',
               '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-shortest', out_path]
    else:
        src = os.path.join(ROOT, seg['src']) if not os.path.isabs(seg['src']) else seg['src']
        start = float(seg.get('start', 0)); end = float(seg['end']); speed = float(seg.get('speed', 1.0))
        dur = (end - start) / speed
        phone = (f"[1:v]trim=start={start}:end={end},setpts=(PTS-STARTPTS)/{speed},"
                 f"scale=-2:{PHONE_H}:flags=lanczos,format=yuva420p[ph]")
        overlay = f"[0:v][ph]overlay=x={PHONE_X}:y={(H - PHONE_H) // 2}:shortest=1[base]"
        tf = text_filters(seg)
        text = f"[base]{tf}[v]" if tf else "[base]copy[v]"
        fc = ';'.join([phone, overlay, text])
        cmd = [FFMPEG, '-y', '-loglevel', 'error',
               '-f', 'lavfi', '-i', f'color=c={BG}:s={W}x{H}:r={FPS}:d={dur:.3f}',
               '-i', src,
               '-f', 'lavfi', '-i', f'anullsrc=r=48000:cl=stereo:d={dur:.3f}',
               '-filter_complex', fc, '-map', '[v]', '-map', '2:a',
               '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-t', f'{dur:.3f}', out_path]
    subprocess.run(cmd, check=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--frame', type=float, default=None, help='also write <out>.png at this second')
    args = ap.parse_args()
    for f in (FONT_HEAD, FONT_BODY, FONT_BODY_BOLD, FFMPEG):
        if not os.path.exists(f):
            print('missing:', f, file=sys.stderr); return 2
    with open(args.shots) as fh:
        shots = json.load(fh)
    with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as tmp:
        paths = []
        for i, seg in enumerate(shots):
            p = os.path.join(tmp, f'seg{i:02d}.mp4')
            render_segment(seg, p)
            paths.append(p)
            print(f'segment {i} ok: {seg.get("kind", "clip")} {seg.get("head", "")!r}')
        lst = os.path.join(tmp, 'list.txt')
        with open(lst, 'w') as fh:
            for p in paths:
                fh.write(f"file {shlex.quote(p)}\n")
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
                        '-c', 'copy', args.out], check=True)
    probe = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', args.out],
                           capture_output=True, text=True, check=True).stdout.strip()
    print(f'wrote {args.out} ({float(probe):.1f}s)')
    if args.frame is not None:
        png = os.path.splitext(args.out)[0] + '.png'
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-ss', str(args.frame), '-i', args.out, '-frames:v', '1', png], check=True)
        print('frame:', png)
    return 0


if __name__ == '__main__':
    sys.exit(main())
