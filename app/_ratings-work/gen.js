const fs = require('fs');

const OUT = 'C:/Users/MELODY~1.INS/AppData/Local/Temp/claude/w--JubiLujah-com/ec7103b0-63ad-4a95-aa19-bd776d58fc35/tasks/wlvoxu977.output';
let raw = fs.readFileSync(OUT, 'utf8');

// The file holds the workflow result JSON (possibly with surrounding text). Extract the outermost object.
let obj;
try { obj = JSON.parse(raw); }
catch {
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  obj = JSON.parse(raw.slice(s, e + 1));
}

const ratings = (obj.result && obj.result.ratings) || obj.ratings || [];
const map = {};
let dupes = 0;
for (const r of ratings) {
  if (map[r.code] !== undefined) dupes++;
  map[r.code] = r.composite;
}
const codes = Object.keys(map).sort();
const vals = codes.map((c) => map[c]);

// Generate the TS module
let ts = `// AUTO-GENERATED — do not edit by hand.\n`;
ts += `// Album composite ratings (blueprint-based, reused from each persona's\n`;
ts += `// executive-summary.html; see /album-ratings-extract workflow). Used ONLY to\n`;
ts += `// order album cards highest->lowest; never displayed. ${codes.length} albums.\n`;
ts += `export const ALBUM_RATINGS: Record<string, number> = {\n`;
for (const c of codes) ts += `  ${JSON.stringify(c)}: ${map[c]},\n`;
ts += `};\n\n`;
ts += `// Returns the album's composite, or 0 for unknown codes (sorts them last).\n`;
ts += `export function albumRating(code: string): number {\n`;
ts += `  return ALBUM_RATINGS[code] ?? 0;\n`;
ts += `}\n`;

fs.writeFileSync('w:/JubiLujah.com/app/web/lib/album-ratings.ts', ts);

console.log('albums:', codes.length, 'dupes:', dupes);
console.log('min:', Math.min(...vals), 'max:', Math.max(...vals));
console.log('Jubilujah JEIM1069EN:', map['JEIM1069EN']);
console.log('sample jubilee top by rating:',
  codes.filter((c) => c.startsWith('JEIM')).sort((a, b) => map[b] - map[a]).slice(0, 5).map((c) => `${c}=${map[c]}`).join(', '));
console.log('wrote app/web/lib/album-ratings.ts');
