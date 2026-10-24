# Folio

A word processor for people who are familiar with MS Word, made for office letters in English and Bangla. It is a single web page: it runs in the browser, opens and saves Word files, and exports PDFs that match the page on screen.

## Try it

- **In Claude:** https://claude.ai/artifact/2NG1XvnV5qSiKg5z3TwePJ. When you are signed in to Claude, documents are saved to your Claude account. Otherwise they stay in your browser.
- **On the web:** https://resz073.github.io/folio/. This is the same page served by GitHub Pages. Documents are saved in your browser only, and the Claude tab (proofreading, translation, drafting) does not work there.
- **On your computer:** run `python3 build.py`, then `python3 -m http.server 8765` in this folder, and open http://localhost:8765/dist/index.html.

## What to test

- **Writing and layout:** fonts and styles, lists (including Bangla numbering such as ১। and ১)), tables, pictures, shapes and text boxes, headers and footers with letterheads, page numbers, footnotes, section breaks, and page sizes like A4, Legal and F4.
- **Bangla:**
  - **Typing:** press F12 for Avro or Ctrl+Alt+B for Bijoy. Review › Convert changes text between Bijoy (SutonnyMJ) and Unicode.
  - **Fonts:** add SutonnyOMJ or Nikosh with "Add a font from a file".
  - **Page numbers:** Insert › Page Number has ১, ২, ৩ and "পৃষ্ঠা ১ এর ৩".
  - **Dates:** Insert › Date & Time writes dates in বঙ্গাব্দ, খ্রিস্টাব্দ or English, including the two-line letter date.
  - **Government letters:** File › New › সরকারি পত্র. The first time, it asks for your office details.
- **Review:** comments, Track Changes, and version history with Compare.
- **Files:** open .docx, .html, .md and .txt files. Export Word, PDF, web page, Markdown and text. Printing goes through a PDF.

## Reporting a problem

Open an issue and include:

- what you did, step by step
- what you expected, and what happened instead
- your browser and device (for example, Chrome on Windows or Safari on an iPhone)
- a screenshot, and the file if the problem is with opening or saving one (remove anything private first)

## For developers

- **Sources:** `src/js/*.js` are joined in name order into one script. `src/app.css` styles the app, `src/doc.css` styles the document, and `src/body.html` is the page's markup.
- **Build:** `python3 build.py` writes `dist/folio.html` (the Claude artifact), `dist/index.html` (the same page on its own) and `dist/test.html` (the test page, which exposes `window.__Q`).
- **GitHub Pages:** `python3 tools/pages.py` copies the built page and its fonts into `docs/`. To publish, go to Settings › Pages and deploy from the `main` branch, `/docs` folder.
- **Fonts:** `dist/fonts/` holds the fonts that PDF exports embed. Their licenses are in `dist/fonts/LICENSES.txt`, and `tools/fonts.py` rebuilds them from Google Fonts' sources.
- **Tests:** the tests use Playwright (Python) with Chromium.
  - **Setup:** run `pip install playwright python-docx pillow pypdf fonttools`, then `python3 -m playwright install chromium` and `npm install jszip`. You also need poppler-utils (`pdftotext`, `pdfinfo`, `pdftoppm`); a few Word checks also use LibreOffice.
  - **Running:** start `python3 -m http.server 8765 --bind 127.0.0.1` in this folder, then run `bash tests/run_all.sh` for everything, or a single test such as `python3 tests/smoke.py`.
- **Design notes:** `NOTES.md` has detailed notes on how each part works.

## License

Copyright (C) 2026 resz073

Folio is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It comes with no warranty. See [LICENSE](LICENSE) for the full text.

The fonts in `dist/fonts/` and `docs/fonts/` are not covered by this license. Each keeps its own license, listed in `dist/fonts/LICENSES.txt`.
