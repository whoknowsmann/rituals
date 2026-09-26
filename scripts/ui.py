#!/usr/bin/env python3
"""Drive the Seeker UI from WSL via Windows adb.exe (scripts/adb.sh).

Usage:
  scripts/ui.py dump                 # list visible text/desc nodes with centers
  scripts/ui.py tapt "Label"         # tap first node whose text/desc contains Label
  scripts/ui.py tap X Y
  scripts/ui.py type "text"          # type into focused field
  scripts/ui.py swipe up|down
  scripts/ui.py back
  scripts/ui.py shot [name]          # screenshot -> artifacts/shots/<name>.png
"""
import os, re, subprocess, sys, time, xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADB = [os.path.join(ROOT, "scripts", "adb.sh")]


def adb(*args, binary=False):
    r = subprocess.run(ADB + list(args), capture_output=True)
    return r.stdout if binary else r.stdout.decode(errors="replace")


def nodes():
    adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    xml = adb("shell", "cat", "/sdcard/ui.xml")
    xml = xml[xml.find("<?xml"):] if "<?xml" in xml else xml
    out = []
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return out
    for n in root.iter("node"):
        t = n.get("text") or ""
        d = n.get("content-desc") or ""
        b = n.get("bounds") or ""
        m = re.findall(r"\d+", b)
        if not m or not (t or d or n.get("clickable") == "true"):
            continue
        x1, y1, x2, y2 = map(int, m)
        out.append({"text": t, "desc": d, "cx": (x1 + x2) // 2, "cy": (y1 + y2) // 2,
                    "click": n.get("clickable") == "true", "pkg": n.get("package")})
    return out


def main():
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "dump":
        for n in nodes():
            if n["text"] or n["desc"]:
                print(f'{n["cx"]:5} {n["cy"]:5} {"*" if n["click"] else " "} {n["text"]!r} {n["desc"]!r}')
    elif cmd == "tapt":
        label = args[0].lower()
        for n in nodes():
            if label in n["text"].lower() or label in n["desc"].lower():
                adb("shell", "input", "tap", str(n["cx"]), str(n["cy"]))
                print("tapped", n["text"] or n["desc"], n["cx"], n["cy"])
                return
        print("NOT FOUND:", args[0]); sys.exit(1)
    elif cmd == "tap":
        adb("shell", "input", "tap", args[0], args[1])
    elif cmd == "type":
        adb("shell", "input", "text", args[0].replace(" ", "%s"))
    elif cmd == "swipe":
        if args[0] == "up":
            adb("shell", "input", "swipe", "540", "1800", "540", "700", "300")
        else:
            adb("shell", "input", "swipe", "540", "700", "540", "1800", "300")
    elif cmd == "back":
        adb("shell", "input", "keyevent", "4")
    elif cmd == "shot":
        name = args[0] if args else time.strftime("%H%M%S")
        os.makedirs(os.path.join(ROOT, "artifacts", "shots"), exist_ok=True)
        p = os.path.join(ROOT, "artifacts", "shots", f"{name}.png")
        with open(p, "wb") as f:
            f.write(adb("exec-out", "screencap", "-p", binary=True))
        print(p)


if __name__ == "__main__":
    main()
