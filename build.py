#!/usr/bin/env python3
"""Assemble Folio into one HTML page (artifact content), the same page on its own (dist/index.html,
for any web server or GitHub Pages) and a local test wrapper (dist/test.html, with window.__Q)."""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)

css = (SRC / "app.css").read_text()
doc_css = (SRC / "doc.css").read_text()
body = (SRC / "body.html").read_text()
js_files = sorted((SRC / "js").glob("*.js"))
js = "\n".join(f"/* ---- {p.name} ---- */\n" + p.read_text() for p in js_files)
js = "(function(){\n" + js + "\n})();\n"

if "</script" in js:
    sys.exit("script contains </script")

head = """<title>Folio</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&display=swap">
"""
page = head + "<style>\n" + css + "\n</style>\n<style id=\"docCss\">\n" + doc_css + "\n</style>\n" + body + "\n<script>\n" + js + "</script>\n"
(DIST / "folio.html").write_text(page)
(DIST / "app.js").write_text(js)

wrapper = ("<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">"
           "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
           "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>"
           + page + "</body></html>")
(DIST / "index.html").write_text(wrapper)
expose = "window.__Q = {S, Prefs, CMD, Tables, Images, Layout, Files, buildDocx, readDocxFile, toMarkdown, toPlainText, Find, Comments, Track, Toc, Dialogs, Backstage, setView, setZoom, setPage, setBlockStyle, toggleList, insertPageBreak, cleanHTML, undo, redo, change, applyInline, setFontSize, setFontFamily, Store, Saver, mdToHtml, sanitizeHtml, insertFragment, openDoc, newDocModel, docStats, geom, GAP, setAlign, QuickParts, AutoComplete, buildPdf, toStandaloneHtml, Hist, collectUnits, topOf, Menus, UI, newFromTemplate, TEMPLATES, openImported, doPaste, Assistant, Cap, Ruler, applyParagraph, setIndent, setLineSpacing, toggleInline, Painter, changeCase, clearFormatting, insertTextAtCaret, setWatermark, setPageNumbers, Nav, Stats, measureStyles, renderSheets, setColumns, LocalStore, CloudStore, chunkHtml, collectPaint, paintPage, pageWords, pageLinks, pageOps, renderPagesForPdf, openStored, AutoCorrect, encodeCanvas, openPane, closePane, Fields, Avro, avroParse, UserFonts, fontAvailable, setDocBnFont, docBnFont, fontFileInfo, FONTS, normalizeFontStacks, Borders, TDraw, decoSync, bdrParse, bdrCss, markParaGroups, normPageBorder, PAT_GEOM, shdColor, applyGridlines, OTFont, shapeRun, scriptRuns, ucProps, shapePlan, PDF_FONT_FILES, buildVectorPdf, PdfDoc, TextSetter, pdfFaceFor, browserHas, splitFamilies, CtxMenu, DecAlign, alignBlock, curAlign, setAlign, LineH, wordLineOf, fontStack, bnStack, Grid, applyZoom, goToPage, updatePageStatus, caretRect, PrintJob, pdfPrintPrefs, Proof, setRange, getRange, PicEdit, Crop, Sigs, hasAlpha, loadImg, CloudStore, Versions, Compare, snapshotDoc, HF, docBody, applyPageBox, applyDocSettings, Story, Notes, Styles, Lists, markerString, Shapes, shapeGeom, histGroup, Sections, Pages, geomAt, ownMargins, pageGeom, Bijoy, bijoyParse, bijoyToUnicode, bijoyFromUnicode, bijoyScore, isBijoyFont, Menu, PasteChip, Paste, BnDate, toBs, fromBs, bsMonthLen, Office, OfficeLetter, LETTER_TYPES};"
test_js = js.replace("\n})();\n", "\n" + expose + "\n})();\n")
test_page = page.replace(js, test_js)
wrapper_t = wrapper.replace(page, test_page)
(DIST / "test.html").write_text(wrapper_t)
print(f"built {len(page)/1024:.1f} KB page, {len(js_files)} js files")
