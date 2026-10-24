import asyncio, sys, json
sys.path.insert(0, 'tests')
from harness import *
CASES = [
  ('ami banglay gan gai', 'আমি বাংলায় গান গাই'), ('amar sOnar bangla', 'আমার সোনার বাংলা'), ('bidyaloy', 'বিদ্যালয়'),
  ('shromik', 'শ্রমিক'), ('kormo', 'করম'), ('korrmo', 'কর্ম'), ('dhorrmo', 'ধর্ম'), ('kkhoma', 'ক্ষমা'), ('hoThat``', 'হঠাৎ'),
  ('ca^d', 'চাঁদ'), ('biggan', 'বিজ্ঞান'), ('swagotom', 'স্বাগতম'), ('krriShok', 'কৃষক'), ('2026', '২০২৬'), ('ami.', 'আমি।'),
  ('tumi kemon acho?', 'তুমি কেমন আছ?'), ('OI', 'ঐ'), ('kOI', 'কৈ'), ('Dhaka', 'ঢাকা'), ('bangladesh', 'বাংলাদেশ'), ('joy bangla', 'জয় বাংলা'),
  ('rrk', 'র্ক'), ('ongko', 'অংক'), ('bou', 'বউ'), ('kea', 'কেয়া'), ('yes', 'ইয়েস'), ('dukkho', 'দুক্ষ'), ('shikkha', 'শিক্ষা'), ('shikkhok', 'শিক্ষক'),
  ('sikSha', 'সিক্ষা'), ('shikSha', 'শিক্ষা'), ('bhalObasa', 'ভালোবাসা'), ('porikkha', 'পরিক্ষা'), ('pOrIkSha', 'পোরীক্ষা'), ('ujjol', 'উজ্জল'), ('Rin', 'ড়িন'),
  ('ri`n', 'রিন'), ('a`', 'া'), ('$500', '৳৫০০'), ('ka,,', 'কা্‌'),
]
async def main():
    async with async_playwright() as p:
        b, page, errors = await new_page(p)
        await load(page)
        res = await page.evaluate("(cases) => cases.map(([i]) => __Q.avroParse(i))", CASES)
        bad = 0
        for (inp, exp), got in zip(CASES, res):
            ok = got == exp
            if not ok: bad += 1
            print(('ok  ' if ok else 'DIFF'), f'{inp:24s} -> {got}' + ('' if ok else f'   (expected {exp})'))
        print('mismatches:', bad)
        for e in errors: print('ERR', e)
        await b.close()
asyncio.run(main())
