#!/usr/bin/env python3
"""Copy the built page and its fonts into docs/ for GitHub Pages (Settings › Pages › Deploy from a
branch: main, /docs). Run python3 build.py first. Outside Claude, Folio keeps documents in the
browser, and the Claude tab's features are not available."""
import pathlib, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST, DOCS = ROOT / 'dist', ROOT / 'docs'
if not (DIST / 'index.html').is_file():
    sys.exit('dist/index.html is missing: run python3 build.py first')
(DOCS / 'fonts').mkdir(parents=True, exist_ok=True)
shutil.copyfile(DIST / 'index.html', DOCS / 'index.html')
names = {p.name for p in (DIST / 'fonts').iterdir() if p.is_file()}
for p in (DOCS / 'fonts').iterdir():
    if p.name not in names: p.unlink()
for n in sorted(names):
    src, dst = DIST / 'fonts' / n, DOCS / 'fonts' / n
    if not dst.exists() or dst.stat().st_size != src.stat().st_size or dst.read_bytes() != src.read_bytes():
        shutil.copyfile(src, dst)
(DOCS / '.nojekyll').write_text('')   # serve the files as they are
print(f'docs/index.html and {len(names)} font files')
