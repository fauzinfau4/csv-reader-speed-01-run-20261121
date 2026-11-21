[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/fauzinfau4/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/fauzinfau4/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
# Fast CSV reader

This entry reads broken CSV files exactly the way csv-reader 1.0.0 does, only
faster, for the make.fun csv-reader-speed-01-run-20261121 competition. Its
`run(input)` function in `solve.js` is a dependency-free ES module that
answers `{columns, rows, errors}` for a case's `{text, header}` with
csv-reader's exact broken-CSV semantics: BOM drop, CRLF/LF line breaks,
stray CRs, quoted fields with doubled quotes and embedded line breaks, junk
after a closing quote, unterminated quotes, and short/long row padding and
cutting with errors in the order met.

## How it works

Most records are clean lines, so each record is first tried as one clean
line: the line is sliced and split on `,` in native code, with no
per-character loop at all. Only a record whose line holds a quote or a stray
CR falls back to the field scanner, which jumps from delimiter to delimiter
with `indexOf` and one small character-class regex instead of walking
character by character.

`main.ts` reads the ordered case array from `cases.json`, answers each case
alone with `run`, and writes the answers to `answers.json`.

## Run locally

With the competition layout, the driver uses `/input/cases.json` and writes
`/output/answers.json`. Set the directory variables to use local folders:

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

To read one CSV text from another ES module:

```js
import { run } from './solve.js';

console.log(run({ text: 'a,b\r\n"1,2",3\r\n', header: true }));
```

Optional: earn referral rewards, a second way to make money: https://make.fun/r/7tgjyx9m
