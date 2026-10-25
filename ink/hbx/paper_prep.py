#!/usr/bin/env python3
"""Chuyển ảnh của các item cut/plate trong storyboard format paper thành sticker riso (assets/paper_*.png)."""
import json, sys
from pathlib import Path
from paperize import paperize
sbp = Path(sys.argv[1]); sb = json.loads(sbp.read_text()); spot = sb.get('spot', '#e8432e')
for s in sb['scenes']:
    for k, it in enumerate(s.get('items', [])):
        img = it.get('image')
        if it.get('kind') not in ('cut', 'plate') or not img or not img.get('src') or 'paper_' in img['src']: continue
        src = sbp.parent / img['src']; dst = src.parent / f"paper_{src.stem}_{it['kind']}.png"
        if not dst.exists(): print(' ', paperize(src, dst, 'cut' if it['kind'] == 'cut' else 'plate', spot, seed=k + 3), dst.name)
        img['orig'] = img['src']; img['src'] = f'assets/{dst.name}'
sbp.write_text(json.dumps(sb, ensure_ascii=False, indent=1))
