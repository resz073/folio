#!/usr/bin/env python3
"""Write dist/source-bundle.json: every source, test and tool file, so the project can be
restored from the published artifact (fonts are published separately as fonts/*.ttf)."""
import json, pathlib, datetime
ROOT = pathlib.Path(__file__).resolve().parent.parent
files = {}
for pat in ['NOTES.md', 'build.py', 'src/**/*', 'tests/*.py', 'tests/*.js', 'tools/*.py']:
    for p in sorted(ROOT.glob(pat)):
        if p.is_file() and '__pycache__' not in p.parts:
            files[str(p.relative_to(ROOT))] = p.read_text()
out = {'project': 'folio', 'saved': datetime.date.today().isoformat(), 'files': files}
(ROOT / 'dist' / 'source-bundle.json').write_text(json.dumps(out, ensure_ascii=False))
print(len(files), 'files', round((ROOT / 'dist' / 'source-bundle.json').stat().st_size / 1024), 'KB')
