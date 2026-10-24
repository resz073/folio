/* ===================== Templates ===================== */
const TEMPLATES = [
  { id: 'blank', name: 'Blank document', desc: 'An empty page', build: () => ({ title: 'Untitled document', html: '<p><br></p>', over: {} }) },
  { id: 'welcome', name: 'Welcome guide', desc: 'A tour of what Folio can do', build: () => welcomeDoc() },
  { id: 'letter', name: 'Business letter', desc: 'Block-style letter with sender, date and subject', build: () => ({
    title: 'Business letter',
    over: { page: { mt: 96, mb: 96, ml: 96, mr: 96 } },
    html: `<p style="text-align:right"><b>[Company Name]</b></p><p style="text-align:right">[Street address]<br>[City, Postal code]<br>[Phone] · [Email]</p><p><br></p>
<p>${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
<p>[Recipient Name]<br>[Title]<br>[Organization]<br>[Address]</p>
<p><b>Subject: [What this letter is about]</b></p>
<p>Dear [Mr./Ms. Last name],</p>
<p style="text-align:justify">I am writing to [state the purpose in one sentence]. [Add the background the reader needs: what happened, what was agreed, or what you are asking for.]</p>
<p style="text-align:justify">[Give the details: dates, amounts, references and any documents you have enclosed. Keep each paragraph to one idea.]</p>
<p style="text-align:justify">Please let me know by [date] whether [the action you need]. I can be reached at [phone] or [email] if you have any questions.</p>
<p>Sincerely,</p><p><br></p><p><br></p>
<p>[Your Name]<br>[Your Title]</p>
<p style="font-size:9pt;color:#595959">Enclosure: [Document name]</p>`,
  }) },
  { id: 'gov', name: 'সরকারি পত্র', desc: 'Government letter from your office profile: স্মারক নম্বর, তারিখ, বিষয়, সূত্র, বিতরণ (also অফিস আদেশ, প্রজ্ঞাপন, নোটিশ, English)', build: () => OfficeLetter.sample(), start: () => OfficeLetter.start() },
  { id: 'leave-bn', name: 'ছুটির আবেদন', desc: 'Leave application in Bangla', build: () => ({
    title: 'ছুটির আবেদন',
    over: { font: 'Noto Serif Bengali', size: 13, line: 1, lang: 'bn-BD', page: { mt: 96, mb: 96, ml: 108, mr: 96 } },
    html: `<p style="text-align:right">তারিখ: [তারিখ]</p>
<p>বরাবর,<br>ব্যবস্থাপনা পরিচালক<br>[প্রতিষ্ঠানের নাম]<br>[ঠিকানা]</p>
<p><b>বিষয়: তিন দিনের ছুটির জন্য আবেদন।</b></p>
<p>জনাব,</p>
<p style="text-align:justify">বিনীত নিবেদন এই যে, আমি [আপনার নাম], [পদবি] হিসেবে [বিভাগ] বিভাগে কর্মরত আছি। পারিবারিক প্রয়োজনে আগামী [শুরুর তারিখ] থেকে [শেষ তারিখ] পর্যন্ত মোট তিন দিন অফিসে উপস্থিত থাকা আমার পক্ষে সম্ভব হবে না। এই সময়ে আমার দায়িত্ব [সহকর্মীর নাম] পালন করবেন।</p>
<p style="text-align:justify">অতএব, বিনীত প্রার্থনা এই যে, আমাকে উক্ত তিন দিনের ছুটি মঞ্জুর করে বাধিত করবেন।</p>
<p>বিনীত নিবেদক,</p><p><br></p>
<p>[স্বাক্ষর]<br>[আপনার নাম]<br>[পদবি], [বিভাগ]<br>মোবাইল: [নম্বর]</p>`,
  }) },
  { id: 'memo', name: 'Memo', desc: 'Internal memo with to, from, date and subject', build: () => ({
    title: 'Memo',
    over: { header: { l: '', c: '', r: 'Internal' }, footer: { l: '', c: 'Page {PAGE} of {PAGES}', r: '' } },
    html: `<p class="title">Memo</p>
<table class="tbl-plain" style="width:100%"><colgroup><col style="width:16%"><col style="width:84%"></colgroup><tbody>
<tr><td><p><b>To</b></p></td><td><p>[Team or names]</p></td></tr><tr><td><p><b>From</b></p></td><td><p>[Your name, title]</p></td></tr>
<tr><td><p><b>Date</b></p></td><td><p>${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p></td></tr><tr><td><p><b>Subject</b></p></td><td><p>[Subject]</p></td></tr></tbody></table>
<hr>
<h2>Purpose</h2><p>[One or two sentences on why you are writing and what you need from the reader.]</p>
<h2>Details</h2><p>[The facts the reader needs. Keep it short and specific.]</p>
<h2>Next steps</h2><ol><li>[First action, owner, date]</li><li>[Second action, owner, date]</li><li>[Third action, owner, date]</li></ol>`,
  }) },
  { id: 'report', name: 'Report', desc: 'Title page, contents and sections', build: () => ({
    title: 'Report',
    over: { firstDiff: true, footer: { l: '{TITLE}', c: '', r: 'Page {PAGE} of {PAGES}' } },
    html: `<p><br></p><p><br></p><p><br></p><p class="title">[Report Title]</p><p class="subtitle">[A one-line description of what this report covers]</p><p><br></p>
<p>Prepared by [Name]<br>[Department]<br>${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
<hr class="pb">
<div class="toc" contenteditable="false"><p class="toc-title">Contents</p><p class="toc-empty">Choose Update Table on the References tab to list the headings below.</p></div>
<h1>Introduction</h1><p>[Explain the question this report answers and why it matters now.]</p>
<h1>Findings</h1><p>[Summarize what you found. Use one paragraph per finding.]</p>
<h2>Key figures</h2>
<table class="tbl-c-blue hdr band" style="width:100%"><colgroup><col style="width:40%"><col style="width:20%"><col style="width:20%"><col style="width:20%"></colgroup><tbody>
<tr><td><p>Measure</p></td><td><p>Last year</p></td><td><p>This year</p></td><td><p>Change</p></td></tr>
<tr><td><p>[Measure]</p></td><td><p>[0]</p></td><td><p>[0]</p></td><td><p>[0%]</p></td></tr>
<tr><td><p>[Measure]</p></td><td><p>[0]</p></td><td><p>[0]</p></td><td><p>[0%]</p></td></tr></tbody></table>
<h1>Recommendations</h1><ol><li>[Recommendation and the reason for it]</li><li>[Recommendation and the reason for it]</li></ol>
<h1>Conclusion</h1><p>[Close with the decision you need and when.]</p>`,
  }) },
  { id: 'resume', name: 'Resume', desc: 'One-page CV', build: () => ({
    title: 'Resume',
    over: { page: { mt: 72, mb: 72, ml: 76, mr: 76 }, after: 4 },
    html: `<p class="title" style="font-size:24pt">[Your Name]</p>
<p style="color:#595959">[City, Country] · [Phone] · [Email] · [LinkedIn or website]</p>
<hr>
<h2>Profile</h2><p>[Two sentences: what you do, for how long, and what you are known for.]</p>
<h2>Experience</h2>
<p><b>[Job Title]</b>, [Company] <span style="color:#595959">· [Month Year] – Present</span></p>
<ul><li>[Result you achieved, with a number if you can]</li><li>[Responsibility that matters for the job you want]</li></ul>
<p><b>[Job Title]</b>, [Company] <span style="color:#595959">· [Month Year] – [Month Year]</span></p>
<ul><li>[Result you achieved]</li><li>[Responsibility]</li></ul>
<h2>Education</h2><p><b>[Degree]</b>, [University] <span style="color:#595959">· [Year]</span></p>
<h2>Skills</h2><p>[Skill] · [Skill] · [Skill] · [Language: Bangla, English]</p>`,
  }) },
  { id: 'minutes', name: 'Meeting minutes', desc: 'Attendees, agenda, decisions and actions', build: () => ({
    title: 'Meeting minutes',
    over: {},
    html: `<p class="title">Meeting Minutes</p><p class="subtitle">[Meeting name]</p>
<table class="tbl-lines" style="width:100%"><colgroup><col style="width:22%"><col style="width:78%"></colgroup><tbody>
<tr><td><p><b>Date and time</b></p></td><td><p>${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, [time]</p></td></tr>
<tr><td><p><b>Location</b></p></td><td><p>[Room or link]</p></td></tr><tr><td><p><b>Chair</b></p></td><td><p>[Name]</p></td></tr>
<tr><td><p><b>Attendees</b></p></td><td><p>[Names]</p></td></tr><tr><td><p><b>Apologies</b></p></td><td><p>[Names]</p></td></tr></tbody></table>
<h2>Agenda</h2><ol><li>[Topic]</li><li>[Topic]</li><li>[Topic]</li></ol>
<h2>Discussion</h2><p>[Key points raised for each topic.]</p>
<h2>Decisions</h2><ul><li>[Decision]</li></ul>
<h2>Action items</h2>
<table class="tbl-c-gray hdr" style="width:100%"><colgroup><col style="width:54%"><col style="width:24%"><col style="width:22%"></colgroup><tbody>
<tr><td><p>Action</p></td><td><p>Owner</p></td><td><p>Due</p></td></tr><tr><td><p>[Action]</p></td><td><p>[Name]</p></td><td><p>[Date]</p></td></tr><tr><td><p>[Action]</p></td><td><p>[Name]</p></td><td><p>[Date]</p></td></tr></tbody></table>
<p>Next meeting: [date and time]</p>`,
  }) },
];
function welcomeDoc() {
  const k = (a, b) => `<tr><td><p>${a}</p></td><td><p>${b}</p></td></tr>`;
  return {
    title: 'Welcome to Folio',
    over: { footer: { l: 'Welcome to Folio', c: '', r: 'Page {PAGE} of {PAGES}' } },
    html: `<p class="title">Welcome to Folio</p>
<p class="subtitle">A word processor that works the way you expect, right inside Claude.</p>
<p>This guide is an ordinary document, so try things on it. Every change is saved automatically. When you are ready, open <b>File › New</b> for a blank page or a template, or <b>File › Open</b> to bring in a Word file.</p>
<h1>Start writing</h1>
<p>Type as you would anywhere. Press <b>Enter</b> for a new paragraph and <b>Shift+Enter</b> for a line break inside one. Text flows from page to page on its own, and <b>Ctrl+Enter</b> starts a new page whenever you want one.</p>
<ul class="checklist"><li data-checked="true">Open this guide</li><li data-checked="false">Select a word and make it <b>bold</b> with Ctrl+B</li><li data-checked="false">Apply Heading 1 from the Styles gallery on the Home tab</li><li data-checked="false">Switch the paper to Legal or F4 on the Layout tab</li><li data-checked="false">Export a PDF from File › Export</li></ul>
<h1>Format with the ribbon</h1>
<p>The Home tab holds fonts, sizes, colors, <span style="background-color:#ffff00">highlighting</span>, lists, alignment, line spacing and styles. The small arrow in the corner of the Font and Paragraph groups opens every option at once. Calibri, Cambria, Arial and Times New Roman come with free look-alike fonts, so lines and pages break close to where Word breaks them. Bangla fonts are built in too: <span style="font-family:'Hind Siliguri', 'Noto Sans Bengali', sans-serif">বাংলায় লিখুন, ফন্ট বদলান, পিডিএফ করুন।</span></p>
<h2>Paper, margins and pages</h2>
<p>On the Layout tab choose A4, Letter, Legal, F4/Folio or Foolscap paper, portrait or landscape, and the margins. Drag the markers on the ruler to set indents and margins. Add page numbers, a header, a footer, a watermark or a page border from the Insert and Layout tabs.</p>
<table class="tbl-c-green hdr band" style="width:100%"><colgroup><col style="width:58%"><col style="width:42%"></colgroup><tbody>
<tr><td><p>To do this</p></td><td><p>Press</p></td></tr>
${k('Bold, italic, underline', 'Ctrl+B, Ctrl+I, Ctrl+U')}${k('Center or justify a paragraph', 'Ctrl+E, Ctrl+J')}${k('Heading 1, 2, 3', 'Ctrl+Alt+1, 2, 3')}${k('Find and replace', 'Ctrl+F, Ctrl+H')}${k('Undo and redo', 'Ctrl+Z, Ctrl+Y')}${k('New comment', 'Ctrl+Alt+M')}${k('All shortcuts', 'the keyboard icon at the top right')}
</tbody></table>
<h2>Tables</h2>
<p>Insert a table from <b>Insert › Table</b>, or choose <b>Draw Table</b> and drag with the pencil: draw a box for the table, then lines inside it to split cells. The <b>Eraser</b> merges cells again. With the cursor in a table, the <b>Table Design</b> tab has everything for it: Insert and Delete, Merge and Split Cells, Split Table, Draw Table and Eraser, and <b>Borders and Shading</b> for line styles, colors, widths, diagonal lines and shading patterns.</p>
<h1>Review and share</h1>
<p>Select text and choose <b>New Comment</b> to leave a note in the margin. Turn on <b>Track Changes</b> on the Review tab and every edit is marked so someone can accept or reject it. When you export to Word, comments and tracked changes travel with the file.</p>
<p class="quote">Quick Parts remember text you use often. Save an address or a signature once, then type its first two letters and press Enter.</p>
<h2>Fill in letters and forms</h2>
<p>The letters under <b>File › New</b> have fields in square brackets, like [Recipient Name]. Click a field to select it and type over it, press <b>F11</b> for the next one, or open <b>Insert › Fill Fields</b> to fill every field at once. Names and addresses you used before come up after the first letter or two. <b>সরকারি পত্র</b> makes a government letter from your office profile: স্মারক নং, তারিখ in both calendars, বিষয়, সূত্র and the বিতরণ list.</p>
<h2>Type in Bangla</h2>
<p>Press <b>F12</b> (or click <b>ENG</b> in the status bar) to type Bangla the Avro way: <i>ami banglay likhi</i> becomes আমি বাংলায় লিখি. If you type with Bijoy, press <b>Ctrl+Alt+B</b>: the keys are Bijoy’s, and the text is Unicode. Bijoy text (SutonnyMJ) that you paste or open from Word becomes Unicode by itself, and <b>Review › Convert</b> turns text either way. Bangla text uses the font chosen under <b>Font › Font for Bangla text</b>, such as SutonnyOMJ or Nikosh. If a font isn’t on a computer, add its file once with <b>Add a font from a file</b> and it works on all your devices.</p>
<h2>Write with Claude</h2>
<p>Select a paragraph and open the Claude tab to improve it, fix the grammar, make it more formal, or translate between Bangla and English. You can also describe a letter, and Claude drafts it at the cursor.</p>
<h2>Open and save files</h2>
<p>Folio opens .docx, .html, .md and .txt files and exports Word, PDF, web page, Markdown and plain text. Your documents live in your Claude account, so they are here the next time you open Folio.</p>`,
  };
}
function newFromTemplate(id) {
  const t = TEMPLATES.find(x => x.id === id) || TEMPLATES[0];
  // a government letter asks for its details first (and the office profile, the first time)
  if (t.start) { t.start(); return; }
  const b = t.build();
  Saver.flush();
  const model = newDocModel(Object.assign({ title: b.title, html: b.html }, b.over || {}));
  openDoc(model, { fresh: true });
  if (id !== 'blank') Saver.mark();
  if (S.editor.querySelector('.toc')) setTimeout(() => Toc.update(true), 60);
}
