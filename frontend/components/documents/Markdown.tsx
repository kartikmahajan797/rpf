import type { ReactNode } from "react";

/**
 * Small markdown renderer for document sections: headings, paragraphs, bullet / numbered lists,
 * tables, **bold**, _italic_ and `code`. It builds React elements (never raw HTML), so section
 * text cannot inject markup. Covers what the document builder and the AI produce; nothing more.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|(?<![\w\\])_[^_]+_(?!\w)|(?<![\w*\\])\*[^*\s][^*]*\*(?!\w))/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of Array.from(text.matchAll(INLINE))) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > last) out.push(unescape(text.slice(last, at)));
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) out.push(<strong key={key}>{inline(token.slice(2, -2), key)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else out.push(<em key={key}>{inline(token.slice(1, -1), key)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(unescape(text.slice(last)));
  return out;
}

const unescape = (s: string) => s.replace(/\\([|*_`\\])/g, "$1");

const isTableRow = (line: string) => line.trim().startsWith("|");
const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${n++}`;

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      // Section titles are h2 in the document; nested headings start at h3.
      const level = Math.min(6, Math.max(3, heading[1].length));
      const Tag = `h${level}` as "h3" | "h4" | "h5" | "h6";
      blocks.push(<Tag key={key}>{inline(heading[2], key)}</Tag>);
      i++;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push(
        <div key={key} className="md-table-wrap">
          <table>
            <thead>
              <tr>
                {header.map((h, c) => (
                  <th key={c}>{inline(h, `${key}h${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {header.map((_, c) => (
                    <td key={c}>{inline(row[c] ?? "", `${key}r${r}c${c}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const pattern = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) items.push(pattern.exec(lines[i++])![1]);
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key}>
          {items.map((item, j) => (
            <li key={j}>{inline(item, `${key}-${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      para.push(lines[i++]);
    }
    blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
  }

  return <div className={`md ${className ?? ""}`}>{blocks}</div>;
}
