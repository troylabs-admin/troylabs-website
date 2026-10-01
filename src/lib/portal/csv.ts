/** RFC 4180 quoted fields (including embedded newlines); tab-separated pastes are accepted too. */
export function parseRosterCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false;
  const pushField = () => { row.push(field.trim()); field = ''; closed = false; };
  const pushRow = () => { pushField(); if (row.some(Boolean)) rows.push(row); row = []; };
  const text = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += c; }
    else if (c === ',' || c === '\t') pushField();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (c === '"' && !field.trim() && !closed) { field = ''; quoted = true; }
    else if (closed && c.trim()) throw new Error('Unexpected text after a quoted CSV field.');
    else field += c;
  }
  if (quoted) throw new Error('A quoted CSV field is missing its closing quote.');
  if (field || row.length) pushRow();
  return rows;
}
