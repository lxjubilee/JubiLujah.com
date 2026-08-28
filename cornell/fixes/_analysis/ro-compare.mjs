// Compare a cornell/ original RO lyric doc against its cornell/fixes/ "Fixed" doc.
// The Fixed doc keeps the original text and appends the reviewer's corrected version under an
// "After:" marker — either scoped to one section, or as a whole-song rewrite. Some corrections
// are also made inline, in place, with no marker at all.
//
// Method: rebuild the reviewer's FINAL text per track (apply every After-block replacement),
// then diff that against the same track in the untouched original. One honest number.
//
// Usage: node ro-compare.mjs <before.txt> <after.txt> <CODE>
import { readFileSync } from 'node:fs';

const [beforePath, afterPath, CODE] = process.argv.slice(2);
const rd = (p) => readFileSync(p, 'utf8').split(/\r?\n/);

const isTrack = (l) => /^\d{2}\s+\S/.test(l);
const isSection = (l) => /^\[[^\]]+\]/.test(l.trim());
const isMarker = (l) => /^After:?\s*$/i.test(l.trim());
const isMeta = (l) =>
  /^(Styles:|VOCAL GENDER:|Weirdness:|Style Influence:|Faith-Focus:|Praise vs\.|Earworm:|Bestseller:|Estimated Length:|Song Title:|Save To:|ARTIST:|ARCHETYPE:|LYRICS:|Source:|Reviewer|Date reviewed|Decision |Notes)/i.test(
    l.trim()
  );

const norm = (l) => l.trim().replace(/\s+/g, ' ').replace(/ /g, ' ');

// English production direction that happens to sit outside [brackets] (intro/outro cues).
// Reviewers keep, drop, or replace these inconsistently, so they are not sung text and must
// not be counted as lyric corrections.
const isCue = (l) =>
  /(oud|ney|qanun|daf|darbuka|tanbur|buzuq|mijwiz|frame drum|hand-?percussion|handclaps?|riff|groove|taqsim|drone|sustains?|fades?|BPM|vocal|percussion|birdsong|maqam|motif|count-in|strip-back|breath-audible|gang vocal|tag)/i.test(
    l
  );

// sung lyric line: not blank, not a section tag, not metadata, not a marker, not a bare note
const isLyric = (l) => {
  const t = l.trim();
  if (!t) return false;
  if (isSection(t) || isMeta(t) || isMarker(t) || isTrack(t)) return false;
  if (/^\(.*\)$/.test(t)) return false;
  if (isCue(t)) return false;
  return true;
};

// ---- LCS line diff, adjacent -/+ runs paired into substitutions ----
function diff(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push(['=', a[i], b[j]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', a[i], null]); i++; }
    else { ops.push(['+', null, b[j]]); j++; }
  }
  while (i < n) ops.push(['-', a[i++], null]);
  while (j < m) ops.push(['+', null, b[j++]]);
  const out = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k][0] === '-') {
      const dels = []; while (k < ops.length && ops[k][0] === '-') dels.push(ops[k++][1]);
      const adds = []; while (k < ops.length && ops[k][0] === '+') adds.push(ops[k++][2]);
      k--;
      const pairs = Math.min(dels.length, adds.length);
      for (let p = 0; p < pairs; p++) out.push(['~', dels[p], adds[p]]);
      for (let p = pairs; p < dels.length; p++) out.push(['-', dels[p], null]);
      for (let p = pairs; p < adds.length; p++) out.push(['+', null, adds[p]]);
    } else out.push(ops[k]);
  }
  return out;
}

// ---- split a doc into tracks -> lyric region only ----
function tracksOf(lines) {
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (isTrack(line)) { cur = { title: line.trim(), lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  for (const t of out) {
    const stop = t.lines.findIndex((l) => /^Styles:/i.test(l.trim()));
    t.body = stop === -1 ? t.lines : t.lines.slice(0, stop);
  }
  return out;
}

// ---- rebuild the reviewer's FINAL lyric lines for a Fixed-doc track ----
function finalOf(body, origCount) {
  const emitted = [];      // {line, sectionIdx}
  let sectionStart = 0;    // index in `emitted` where the current section began
  let markers = 0, wholeSong = 0, sectionScoped = 0;

  for (let i = 0; i < body.length; i++) {
    const l = body[i];

    if (isSection(l)) { sectionStart = emitted.length; continue; }

    if (isMarker(l)) {
      markers++;
      // gather the payload (up to the next marker) and decide its scope.
      // A payload carrying two or more section tags is a whole-song rewrite; one or none is
      // scoped to the single section it sits under. (Reviewers sometimes open a whole-song
      // payload with a label line like "(Refren de deschidere)", so first-line tests fail.)
      const rest = [];
      for (let j = i + 1; j < body.length && !isMarker(body[j]); j++) rest.push(body[j]);
      // Size is the reliable signal: a whole-song rewrite is roughly as long as the song,
      // a section-scoped one is a handful of lines. (Tag-counting misfires because the
      // window to the next marker over-reads into the following original section, and
      // reviewers sometimes open a whole-song payload with a label line like
      // "(Refren de deschidere)" instead of a section tag.)
      const whole = rest.filter(isLyric).length >= 0.6 * origCount;

      if (whole) {
        wholeSong++;
        // a whole-song rewrite replaces everything emitted for this track
        emitted.length = 0;
        for (let j = i + 1; j < body.length; j++) {
          if (isMarker(body[j])) break;
          if (isLyric(body[j])) emitted.push(norm(body[j]));
        }
        return { lines: emitted, markers, wholeSong, sectionScoped };
      }

      sectionScoped++;
      // section-scoped: drop what this section already emitted, take the payload instead
      emitted.length = sectionStart;
      let j = i + 1;
      for (; j < body.length; j++) {
        if (isSection(body[j]) || isMarker(body[j])) break;
        if (isLyric(body[j])) emitted.push(norm(body[j]));
      }
      i = j - 1;
      continue;
    }

    if (isLyric(l)) emitted.push(norm(l));
  }
  return { lines: emitted, markers, wholeSong, sectionScoped };
}

const beforeTracks = tracksOf(rd(beforePath));
const afterTracks = tracksOf(rd(afterPath));

const results = [];
for (let k = 0; k < afterTracks.length; k++) {
  const bt = beforeTracks[k];
  const at = afterTracks[k];
  const orig = (bt ? bt.body : []).filter(isLyric).map(norm);
  const fin = finalOf(at.body, orig.length);
  const ops = diff(orig, fin.lines);
  const changed = ops.filter((o) => o[0] === '~');
  const added = ops.filter((o) => o[0] === '+');
  const removed = ops.filter((o) => o[0] === '-');
  results.push({
    n: k + 1,
    titleBefore: bt ? bt.title : null,
    titleAfter: at.title,
    origLines: orig.length,
    finalLines: fin.lines.length,
    markers: fin.markers,
    mode: fin.wholeSong ? 'whole-song' : fin.sectionScoped ? 'section' : 'inline-only',
    edits: changed.length + added.length + removed.length,
    changed: changed.length,
    added: added.length,
    removed: removed.length,
    pairs: ops.filter((o) => o[0] !== '='),
  });
}

console.log(JSON.stringify({ code: CODE, tracks: results }, null, 1));
