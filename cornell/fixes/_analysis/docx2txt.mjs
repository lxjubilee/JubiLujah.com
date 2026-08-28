// Minimal .docx -> plain text extractor (paragraph per line; w:br honored), plus tracked-change detection.
// Usage: node docx2txt.mjs <file.docx> [--report]
import { execFileSync } from 'node:child_process';

const file = process.argv[2];
const report = process.argv.includes('--report');

const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], {
  maxBuffer: 1024 * 1024 * 64,
  encoding: 'utf8',
});

if (report) {
  const ins = (xml.match(/<w:ins\b/g) || []).length;
  const del = (xml.match(/<w:del\b/g) || []).length;
  const com = (xml.match(/<w:commentReference\b/g) || []).length;
  console.error(`[tracked] w:ins=${ins} w:del=${del} comments=${com}`);
}

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&');

// drop deleted text runs entirely (they are not the final content)
const body = xml.replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, '');

const out = [];
for (const p of body.split(/<\/w:p>/)) {
  let line = '';
  // walk <w:t>…</w:t>, <w:br/> and <w:tab/> in document order
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(p)) !== null) {
    if (m[1] !== undefined) line += decode(m[1]);
    else if (m[0].startsWith('<w:br')) line += '\n';
    else line += '\t';
  }
  out.push(line.replace(/ /g, ' ').replace(/[ \t]+$/gm, ''));
}

console.log(out.join('\n').replace(/\n{3,}/g, '\n\n'));
