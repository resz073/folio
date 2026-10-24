import asyncio, json, sys, pathlib, re, os
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
# JSZip, which Folio loads from a CDN, is served from a local copy (the test browser has no internet):
# FOLIO_JSZIP, or node_modules/jszip in the project (npm install jszip), or a global npm tools folder
def _jszip():
    for c in [os.environ.get('FOLIO_JSZIP'), ROOT / 'node_modules/jszip/dist/jszip.min.js', '/opt/npm-tools/node_modules/jszip/dist/jszip.min.js']:
        if c and pathlib.Path(c).is_file(): return pathlib.Path(c).read_text()
    sys.exit('jszip.min.js not found: run `npm install jszip` in the project folder or set FOLIO_JSZIP')
JSZIP = _jszip()
(ROOT / 'shots').mkdir(exist_ok=True)   # screenshots, PDFs and Word files the tests write

def _font_manifest():
    import re, json as _j
    src = (ROOT / 'src' / 'js' / '06-pdffonts.js').read_text()
    return _j.loads(re.search(r'= (\{.*\});', src).group(1))

def gfonts_css(url):
    """Google Fonts css2 answered from the bundled font files, so pages render with the
    same fonts the PDF embeds (the test browser has no internet)."""
    from urllib.parse import urlparse, parse_qs, unquote
    man = _font_manifest()
    out = []
    for spec in parse_qs(urlparse(url).query).get('family', []):
        fam = unquote(spec).split(':')[0].replace('+', ' ')
        files = man.get(fam.lower())
        if not files: continue
        for st, fn in files.items():
            w = 700 if 'b' in st else 400
            it = 'italic' if 'i' in st else 'normal'
            out.append(f"@font-face {{ font-family: '{fam}'; font-style: {it}; font-weight: {w}; src: url(http://localhost:8765/dist/fonts/{fn}) format('truetype'); }}")
    return '\n'.join(out) or '/* none */'

async def new_page(p, width=1400, height=900, mock_caps=False, dark=False, gfonts=False):
    browser = await p.chromium.launch(args=['--font-render-hinting=none'])
    ctx = await browser.new_context(viewport={'width': width, 'height': height}, color_scheme='dark' if dark else 'light', accept_downloads=True)
    page = await ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(('console.' + m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
    async def route(r):
        url = r.request.url
        if 'jszip' in url:
            await r.fulfill(status=200, content_type='application/javascript', body=JSZIP)
        elif 'fonts.googleapis.com' in url:
            await r.fulfill(status=200, content_type='text/css', body=gfonts_css(url) if gfonts else '/* fonts blocked in test */')
        elif url.startswith('http://localhost') or url.startswith('file:'):
            await r.continue_()
        else:
            await r.abort()
    await page.route('**/*', route)
    if mock_caps:
        await page.add_init_script(path=str(ROOT / 'tests' / 'mockcaps.js'))
    return browser, page, errors

async def load(page, path='dist/test.html'):
    await page.goto('http://localhost:8765/' + path)
    await page.wait_for_timeout(600)
