// csv-reader-speed-01-run-20261121: a faster drop-in for csv-reader 1.0.0.
//
// run(input) returns exactly what csv-reader 1.0.0 returns for {text, header}:
// {columns, rows, errors}. The semantics, as the competition's rules state them:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote and each CRLF or lone CR inside it read as LF; what
//     follows its closing quote, up to the next comma or line break, is appended
//     as it stands (quote_junk, when the field ends); a quote that never closes
//     is a literal character, and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it (every record when header is false), each padded with ""
//     (short_row, with fields: its field count) or cut (long_row, with extra:
//     the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met: line the 1-based line
//     its record starts on, counting every LF, CRLF and lone CR inside quotes,
//     and row its record's index in rows, null for the header.
//
// How it is fast: most records are clean lines, so each record is first tried
// as one clean line — the line is sliced and split on ',' in native code, with
// no per-character loop at all. Only a record whose line holds a quote or a
// stray CR falls back to the field scanner below, which jumps from delimiter
// to delimiter with indexOf and one small character-class regex instead of
// walking character by character. Nothing is cached from one case to the next.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** The delimiter class an unquoted field ends at: comma, CR or LF. */
const DELIM = /[,\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Field readers report errors against these.
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the field
  // and how it ended; `added` counts the characters kept after `value`.
  function readUnquoted(value) {
    let added = 0;
    while (pos < len) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        value += text.slice(pos);
        added += len - pos;
        pos = len;
        return { value, ended: END, added };
      }
      const i = m.index;
      const c = text.charCodeAt(i);
      if (c === 44) {
        value += text.slice(pos, i);
        added += i - pos;
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === 10) {
        value += text.slice(pos, i);
        added += i - pos;
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A CR: a line break when LF follows, else a stray CR, dropped.
      if (text.charCodeAt(i + 1) === 10) {
        value += text.slice(pos, i);
        added += i - pos;
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      value += text.slice(pos, i);
      added += i - pos;
      pos = i + 1;
    }
    return { value, ended: END, added };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    // The closing quote: the first quote not followed by another quote.
    let hasDouble = false;
    let from = open + 1;
    let q = -1;
    while (true) {
      q = text.indexOf('"', from);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        hasDouble = true;
        from = q + 2;
        continue;
      }
      break;
    }
    if (q === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as an unquoted field.
      pos = open + 1;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    const raw = text.slice(open + 1, q);
    // Line breaks inside the quotes: every LF, and every CR not part of a
    // CRLF (a CRLF counts once, through its LF).
    let breaks = 0;
    let hasCR = false;
    let i = raw.indexOf('\n');
    while (i !== -1) {
      breaks += 1;
      i = raw.indexOf('\n', i + 1);
    }
    i = raw.indexOf('\r');
    while (i !== -1) {
      hasCR = true;
      if (raw.charCodeAt(i + 1) !== 10) breaks += 1;
      i = raw.indexOf('\r', i + 1);
    }
    line += breaks;
    let value = raw;
    if (hasCR) value = value.replace(/\r\n?/g, '\n');
    if (hasDouble) value = value.replace(/""/g, '"');
    const after = q + 1;
    if (after >= len) {
      pos = len;
      return { value, ended: END };
    }
    const c = text.charCodeAt(after);
    if (c === 44) {
      pos = after + 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos = after + 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(after + 1) === 10) {
      pos = after + 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    pos = after;
    const junk = readUnquoted(value);
    if (junk.added > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields;
    let lastQuoted;
    // Fast path: one clean line. A record can only span lines through a
    // quoted field, and a stray CR only shows up as a CR in the line, so a
    // line with no quote and no CR is exactly one record, split in native
    // code. A trailing CR at the end of the text is a stray CR, not a CRLF,
    // so it takes the slow path instead.
    const nl = text.indexOf('\n', pos);
    const eof = nl === -1;
    const lineEnd = eof ? len : nl;
    const trailingCR = eof && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13;
    if (!trailingCR) {
      const segEnd =
        !eof && text.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
      const seg = text.slice(pos, segEnd);
      if (seg.indexOf('"') === -1 && seg.indexOf('\r') === -1) {
        fields = seg.split(',');
        lastQuoted = false;
        pos = eof ? len : lineEnd + 1;
        if (!eof) line += 1;
      }
    }
    if (fields === undefined) {
      fields = [];
      let ended;
      do {
        if (text.charCodeAt(pos) === 34) {
          lastQuoted = true;
          const field = readQuoted();
          fields.push(field.value);
          ended = field.ended;
        } else {
          lastQuoted = false;
          const field = readUnquoted('');
          fields.push(field.value);
          ended = field.ended;
        }
      } while (ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({
        code: 'short_row',
        line: recordLine,
        row: recordRow,
        fields: fields.length,
      });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({
        code: 'long_row',
        line: recordLine,
        row: recordRow,
        extra: fields.splice(width),
      });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
