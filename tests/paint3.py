import asyncio, sys, base64, io, math
sys.path.insert(0, 'tests')
from harness import *
from paint2 import compare

DOC = r"""
<p>Borders and shading test</p>
<table class="tbl-bd" style="width:100%;--bt:1.5pt solid #c00000;--bb:1.5pt solid #c00000;--bl:1.5pt solid #c00000;--br:1.5pt solid #c00000;--bh:0.5pt solid #000000;--bv:0.5pt dotted #2f5597"><colgroup><col style="width:25%"><col style="width:25%"><col style="width:25%"><col style="width:25%"></colgroup><tbody>
<tr><td><p>A1</p></td><td data-dd="0.75pt solid #000000"><p>B1 diagonal</p></td><td data-shd="horzStripe" data-shdc="#c00000" data-shdf="#fff2cc" style="background-color:#fff2cc"><p>C1 stripes</p></td><td data-shd="pct20" data-shdc="#000000" data-shdf="auto" style="background-color:#cccccc"><p>D1 20%</p></td></tr>
<tr><td style="border-bottom:2.25pt double #1d6a50"><p>A2 double</p></td><td data-du="0.75pt dashed #c00000"><p>B2 up</p></td><td data-shd="diagCross" data-shdc="#2f5597" data-shdf="auto"><p>C2 trellis</p></td><td data-shd="thinReverseDiagStripe" data-shdc="#000000" data-shdf="#e2efda" style="background-color:#e2efda"><p>D2 lt down</p></td></tr>
<tr><td style="border-top:2.25pt double #1d6a50"><p>A3</p></td><td><p>B3</p></td><td><p>C3</p></td><td><p>D3</p></td></tr>
</tbody></table>
<p style="border-top:0.75pt solid #000000;padding-top:1pt;border-bottom:0.75pt solid #000000;padding-bottom:1pt;border-left:0.75pt solid #000000;padding-left:4pt;border-right:0.75pt solid #000000;padding-right:4pt;box-shadow:1.5pt 1.5pt 0 0 #000000">Boxed paragraph one with a shadow, as Word draws it.</p>
<p style="border-top:0.75pt solid #000000;padding-top:1pt;border-bottom:0.75pt solid #000000;padding-bottom:1pt;border-left:0.75pt solid #000000;padding-left:4pt;border-right:0.75pt solid #000000;padding-right:4pt;box-shadow:1.5pt 1.5pt 0 0 #000000">Boxed paragraph two shares the box.</p>
<p>Some text <span data-tb="" style="border:0.75pt solid #c00000;padding:0 1pt">with a text border</span> and <span data-ts="" data-shd="pct25" data-shdc="#000000" data-shdf="auto" style="background-color:#bfbfbf">shaded text</span> in the line.</p>
<p style="border-bottom:3pt groove #808080;padding-bottom:1pt">Engraved bottom border</p>
<p style="border-bottom:3pt ridge #336699;padding-bottom:1pt">Embossed bottom border</p>
<p style="border-top:3pt inset #c00000;border-bottom:3pt inset #c00000;border-left:3pt inset #c00000;border-right:3pt inset #c00000;padding:1pt 4pt">Inset box</p>
<p style="border-top:3pt outset #1d6a50;border-bottom:3pt outset #1d6a50;border-left:3pt outset #1d6a50;border-right:3pt outset #1d6a50;padding:1pt 4pt">Outset box</p>
<table class="tbl-bd" style="width:60%;--bt:3pt ridge #808080;--bb:3pt ridge #808080;--bl:3pt groove #808080;--br:3pt groove #808080;--bh:3pt inset #c00000;--bv:3pt outset #1d6a50"><colgroup><col style="width:50%"><col style="width:50%"></colgroup><tbody><tr><td><p>3-D</p></td><td><p>cells</p></td></tr><tr><td><p>in a</p></td><td><p>table</p></td></tr></tbody></table>
<p>End.</p>
"""

async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p, width=1400, height=1500)
        await load(page)
        await page.evaluate("(html) => __Q.openDoc(__Q.newDocModel({ title: 'Borders', html }))", DOC)
        await page.wait_for_timeout(300)
        await page.evaluate("""async () => {
          document.getElementById('editor').spellcheck = false;
          document.querySelectorAll('#editor [data-dd], #editor [data-du], #editor [data-shd]').forEach(el => __Q.decoSync(el));
          __Q.S.doc.page.border = { style: 'double', width: 0.75, color: '#2f5597', sides: { top: true, bottom: true, left: true, right: true }, shadow: false, from: 'page', m: { t: 24, b: 24, l: 24, r: 24 }, show: 'all' };
          __Q.setZoom(1); __Q.renderSheets(); __Q.Layout.full();
          getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur();
          __Q.Prefs.gridlines = false; __Q.applyGridlines();
        }""")
        await page.wait_for_timeout(500)
        await compare(page, 0, 'p3-1')
        for e in errors: print('ERR', e)
        await b.close()
if __name__ == "__main__":
    asyncio.run(main())
