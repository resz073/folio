#!/bin/bash
# Every test, one after another. Start the server first, in the project folder:
#   python3 -m http.server 8765 --bind 127.0.0.1
# Each test's output goes to shots/out/<name>.txt; a line per test says how it went.
cd "$(dirname "$0")/.."
python3 build.py || exit 1
mkdir -p shots/out
fail=0
for t in smoke func1 func2 func3 func4 func5 fields1 pdf1 pdf2 pdf3 paint1 paint2 paint3 avro1 avro2 avro3 fonts1 fonts2 ui1 ui2 ui3 ui4 ui5 tbl1 tbl2 tbl3 tbl4 shape1 pdf4 pdf5 pdf6 pdf7 store2 cells1 cells2 menu1 dec1 lh1 grid1 print1 proof1 pic1 ver1 hf1 fn1 sty1 shp1 sec1 bj1 bn2 gov1; do
  timeout 600 python3 tests/$t.py > shots/out/$t.txt 2>&1
  rc=$?
  errs=$(grep -c "^ERR\|Traceback\|Error:\|FAIL" shots/out/$t.txt)
  echo "$t rc=$rc errs=$errs"
  if [ $rc -ne 0 ] || [ "$errs" -ne 0 ]; then fail=$((fail+1)); fi
done
echo "$fail failing"
[ $fail -eq 0 ]
