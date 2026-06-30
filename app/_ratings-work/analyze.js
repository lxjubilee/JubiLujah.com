const fs = require('fs'), path = require('path');
const OUT = 'C:/Users/MELODY~1.INS/AppData/Local/Temp/claude/w--JubiLujah-com/ec7103b0-63ad-4a95-aa19-bd776d58fc35/tasks/wgt71ru8e.output';
let raw = fs.readFileSync(OUT, 'utf8');
let obj; try { obj = JSON.parse(raw); } catch { obj = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); }
const res = obj.result || obj;
const rows = res.rows || [];
fs.writeFileSync('w:/JubiLujah.com/app/_ratings-work/report-rows.json', JSON.stringify(rows));

console.log('rows:', rows.length, ' verifyFailures:', (res.verifyFailures || []).join(', '));
console.log('\n=== verify-failure rows (residual flagged by verifier) ===');
for (const r of rows.filter(x => x.pass === false)) {
  console.log(`${r.code}: residual=[${(r.residual || []).join(' | ')}]  spAfter=${r.spanishAfter} spVerified=${r.spanishVerified} wrote=${r.wrote}`);
}

// Find unprocessed second lyrics files
const processed = new Set(JSON.parse(fs.readFileSync('w:/JubiLujah.com/app/_ratings-work/santiago-lyrics-files.json','utf8')).map(x => x.lyricsPath.toLowerCase()));
const root = 'J:/music/albums/inspire/santiago-inspire';
const dirs = fs.readdirSync(root).filter(d => /^SAIM\d+EN-/.test(d));
const unprocessed = [];
for (const d of dirs) {
  const ldir = path.join(root, d, 'lyrics');
  if (!fs.existsSync(ldir)) continue;
  for (const f of fs.readdirSync(ldir).filter(f => /-lyrics\.md$/i.test(f))) {
    const full = (root + '/' + d + '/lyrics/' + f);
    if (!processed.has(full.toLowerCase())) unprocessed.push({ code: d.split('-')[0], folder: d, lyricsPath: full });
  }
}
fs.writeFileSync('w:/JubiLujah.com/app/_ratings-work/santiago-unprocessed.json', JSON.stringify(unprocessed));
console.log('\n=== UNPROCESSED second lyrics files (' + unprocessed.length + ') ===');
for (const u of unprocessed) console.log('  ' + u.lyricsPath.replace(root + '/', ''));
