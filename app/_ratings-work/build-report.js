const fs = require('fs');
const run1 = JSON.parse(fs.readFileSync('w:/JubiLujah.com/app/_ratings-work/report-rows.json', 'utf8'));
const out2 = fs.readFileSync('C:/Users/MELODY~1.INS/AppData/Local/Temp/claude/w--JubiLujah-com/ec7103b0-63ad-4a95-aa19-bd776d58fc35/tasks/w75li2gq6.output', 'utf8');
let o2; try { o2 = JSON.parse(out2); } catch { o2 = JSON.parse(out2.slice(out2.indexOf('{'), out2.lastIndexOf('}') + 1)); }
const run2 = (o2.result || o2).rows || [];

const byCode = {};
for (const r of run1) byCode[r.code] = { ...r, files: 1 };
for (const r of run2) {
  if (byCode[r.code]) { // album had a 2nd lyrics file
    const a = byCode[r.code];
    a.files = 2;
    a.songsEdited = (a.songsEdited || 0) + (r.songsEdited || 0);
    a.linesChanged = (a.linesChanged || 0) + (r.linesChanged || 0);
    a.rosaryMarianRemoved = (a.rosaryMarianRemoved || 0) + (r.rosaryMarianRemoved || 0);
    a.romanticFixes = (a.romanticFixes || 0) + (r.romanticFixes || 0);
    a.faithBefore = Math.min(a.faithBefore, r.faithBefore);
    a.faithAfter = Math.round(((a.faithAfter + r.faithAfter) / 2) * 10) / 10;
    a.spanishBefore = Math.max(a.spanishBefore, r.spanishBefore);
    a.spanishVerified = Math.max(a.spanishVerified ?? 0, r.spanishVerified ?? 0);
  } else byCode[r.code] = { ...r, files: 1 };
}
const rows = Object.values(byCode).sort((a, b) => a.code.localeCompare(b.code));

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(pad('Album', 11) + pad('Faith', 12) + padL('Songs', 6) + padL('Lines', 7) + padL('Ros/Mar', 9) + padL('Romntc', 8) + padL('Span%', 7) + '  Files');
console.log('-'.repeat(72));
let tSongs = 0, tLines = 0, tRos = 0, tRom = 0, fbSum = 0, faSum = 0, maxSp = 0;
for (const r of rows) {
  const faith = `${r.faithBefore}->${r.faithAfter}`;
  console.log(pad(r.code, 11) + pad(faith, 12) + padL(r.songsEdited, 6) + padL(r.linesChanged, 7) + padL(r.rosaryMarianRemoved, 9) + padL(r.romanticFixes, 8) + padL((r.spanishVerified ?? 0) + '%', 7) + '  ' + (r.files === 2 ? '2' : '1'));
  tSongs += r.songsEdited || 0; tLines += r.linesChanged || 0; tRos += r.rosaryMarianRemoved || 0; tRom += r.romanticFixes || 0;
  fbSum += r.faithBefore; faSum += r.faithAfter; maxSp = Math.max(maxSp, r.spanishVerified ?? 0);
}
console.log('-'.repeat(72));
console.log(`TOTALS: ${rows.length} albums | songsEdited=${tSongs} | linesChanged~${tLines} | rosary/Marian removed=${tRos} | romantic fixes=${tRom}`);
console.log(`Faith-Focus avg: ${(fbSum / rows.length).toFixed(1)} -> ${(faSum / rows.length).toFixed(1)} | max Spanish% (any album, verified) = ${maxSp}%`);
console.log(`Albums with 2 lyrics files (both cleaned): ${rows.filter(r => r.files === 2).map(r => r.code).join(', ')}`);
