#!/usr/bin/env python3
"""
Render the Rituals demo video from real phone recordings + caption cards.

No installs: uses the bundled ffmpeg (~/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin)
and the app's own fonts from node_modules (Fraunces 900 for headlines, Figtree
for body), so captions match the app.

A shot list is a JSON array of segments, rendered in order and concatenated:

  {"kind": "clip", "src": "artifacts/video/run.mp4", "start": 12.0, "end": 20.0,
   "speed": 1.0, "head": "One approval.", "body": "Create, stake every week,\nactivate — in one tap.",
   "note": "Seed Vault Wallet · Devnet", "caption": "One approval."}
  {"kind": "card", "dur": 3.0, "head": "Show up, or pay up.", "body": "Rituals", "still": "artifacts/shots/home.png"}
  {"kind": "split", "dur": 12.0, "left": "artifacts/shots/receipt-1.png", "right": "artifacts/shots/receipt-2.png",
   "head": "One promise.\nBoth outcomes.", "caption": "Show up: your stake comes back."}

`caption` is the voiceover line, burned in as a lower third in the text column
(the owner wants captions as well as the voice). `still` dims a phone screenshot
behind a card. `split` shows two stills side by side (the two receipts).

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
CAPTION_Y = H - 200
CAPTION_SIZE = 40


def esc(text: str) -> str:
    """Escape for drawtext: backslash, colon, percent, comma; keep real newlines.

    A straight apostrophe inside the quoted text= value needs two levels of
    filtergraph escaping and still fails on some builds; the typographic one
    (which Figtree/Fraunces render properly) needs none.
    """
    return (text.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\u2019")
            .replace('%', '\\%').replace(',', '\\,'))


def text_filters(seg: dict, text_x: int = TEXT_X, head_size: int = 74) -> str:
    parts = []
    head = seg.get('head'); body = seg.get('body'); note = seg.get('note')
    y = 320
    if head:
        parts.append(f"drawtext=fontfile={FONT_HEAD}:text='{esc(head)}':fontcolor={INK}:fontsize={head_size}:x={text_x}:y={y}:line_spacing=6")
        y += head_size * (head.count('\n') + 1) + 40
    if body:
        parts.append(f"drawtext=fontfile={FONT_BODY}:text='{esc(body)}':fontcolor={INK}:fontsize=40:x={text_x}:y={y}:line_spacing=12")
        y += 52 * (body.count('\n') + 1) + 30
    if note:
        parts.append(f"drawtext=fontfile={FONT_BODY_BOLD}:text='{esc(note)}':fontcolor={LIME}:fontsize=30:x={text_x}:y={y}")
    caption = seg.get('caption')
    if caption:
        # Lower third of the text column: the voiceover line, on a quiet box so it reads over anything.
        lines = caption.count('\n') + 1
        cy = CAPTION_Y - (lines - 1) * (CAPTION_SIZE + 10)
        parts.append(f"drawtext=fontfile={FONT_BODY_BOLD}:text='{esc(caption)}':fontcolor={INK}:fontsize={CAPTION_SIZE}:x={text_x}:y={cy}"
                     f":line_spacing=10:box=1:boxcolor=0x1C1C1C@0.92:boxborderw=22")
    return ','.join(parts)


def _abs(p: str) -> str:
    return p if os.path.isabs(p) else os.path.join(ROOT, p)


def render_segment(seg: dict, out_path: str) -> None:
    kind = seg.get('kind', 'clip')
    if kind == 'card':
        dur = float(seg['dur'])
        tf = text_filters(seg)
        still = seg.get('still')
        if still:
            # A dimmed phone still behind the card text, same place the live phone sits.
            fc = (f"[1:v]scale=-2:{PHONE_H}:flags=lanczos,format=yuva420p,colorchannelmixer=aa=0.35[ph];"
                  f"[0:v][ph]overlay=x={PHONE_X}:y={(H - PHONE_H) // 2}[base];"
                  + (f"[base]{tf}[v]" if tf else "[base]copy[v]"))
            cmd = [FFMPEG, '-y', '-loglevel', 'error',
                   '-f', 'lavfi', '-i', f'color=c={BG}:s={W}x{H}:r={FPS}:d={dur}',
                   '-loop', '1', '-t', str(dur), '-i', _abs(still),
                   '-f', 'lavfi', '-i', f'anullsrc=r=48000:cl=stereo:d={dur}',
                   '-filter_complex', fc, '-map', '[v]', '-map', '2:a',
                   '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-t', str(dur), out_path]
        else:
            vf = f"[0:v]{tf}[v]" if tf else "[0:v]copy[v]"
            cmd = [FFMPEG, '-y', '-loglevel', 'error',
                   '-f', 'lavfi', '-i', f'color=c={BG}:s={W}x{H}:r={FPS}:d={dur}',
                   '-f', 'lavfi', '-i', f'anullsrc=r=48000:cl=stereo:d={dur}',
                   '-filter_complex', vf, '-map', '[v]', '-map', '1:a',
                   '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-shortest', out_path]
    elif kind == 'split':
        # Two stills side by side (the two receipts), text in a narrower column on the right.
        dur = float(seg['dur'])
        split_h = 900
        y0 = (H - split_h) // 2
        tf = text_filters(seg, text_x=1180, head_size=60)
        fc = (f"[1:v]scale=-2:{split_h}:flags=lanczos,format=yuva420p[l];"
              f"[2:v]scale=-2:{split_h}:flags=lanczos,format=yuva420p[r];"
              f"[0:v][l]overlay=x=140:y={y0}[b1];[b1][r]overlay=x=640:y={y0}[base];"
              + (f"[base]{tf}[v]" if tf else "[base]copy[v]"))
        cmd = [FFMPEG, '-y', '-loglevel', 'error',
               '-f', 'lavfi', '-i', f'color=c={BG}:s={W}x{H}:r={FPS}:d={dur}',
               '-loop', '1', '-t', str(dur), '-i', _abs(seg['left']),
               '-loop', '1', '-t', str(dur), '-i', _abs(seg['right']),
               '-f', 'lavfi', '-i', f'anullsrc=r=48000:cl=stereo:d={dur}',
               '-filter_complex', fc, '-map', '[v]', '-map', '3:a',
               '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-t', str(dur), out_path]
    else:
        src = _abs(seg['src'])
        start = float(seg.get('start', 0)); end = float(seg['end']); speed = float(seg.get('speed', 1.0))
        dur = (end - start) / speed
        # screenrecord output is variable frame rate (a frame only when pixels change), so a still
        # screen yields almost no frames: force 30 fps, and never let the phone stream end the segment
        # (overlay's default eof_action=repeat holds the last frame until -t dur).
        phone = (f"[1:v]trim=start={start}:end={end},setpts=(PTS-STARTPTS)/{speed},fps={FPS},"
                 f"scale=-2:{PHONE_H}:flags=lanczos,format=yuva420p[ph]")
        overlay = f"[0:v][ph]overlay=x={PHONE_X}:y={(H - PHONE_H) // 2}[base]"
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
    ap.add_argument('--voice', default=None, help='voiceover audio (m4a/mp3/wav) laid under the cut; video keeps its length')
    args = ap.parse_args()
    for f in (FONT_HEAD, FONT_BODY, FONT_BODY_BOLD, FFMPEG):
        if not os.path.exists(f):
            print('missing:', f, file=sys.stderr); return 2
    with open(args.shots) as fh:
        shots = [seg for seg in json.load(fh) if isinstance(seg, dict) and 'kind' in seg]  # entries with only '_' are comments
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
        silent = os.path.join(tmp, 'silent.mp4') if args.voice else args.out
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
                        '-c', 'copy', silent], check=True)
        if args.voice:
            # Voice under the picture; pad with silence so the video length wins.
            subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', silent, '-i', args.voice,
                            '-filter_complex', '[1:a]apad[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', args.out], check=True)
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
