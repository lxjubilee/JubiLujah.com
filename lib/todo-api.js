'use strict';
// ============================================================================
// /admin/todo.html backing API — worker assignments, album/lyrics loading,
// lyric edit history, and MP3 ingest.
//
// Design notes
//   * Zero dependencies. Plain Node, same as server.js.
//   * J: IS THE SOURCE OF TRUTH. Albums are resolved by album code from a
//     cached index that scans every property root on J: at variable depth,
//     because the layouts differ:
//         j:/singitdone.com/music/<artist>/<CODE-slug>/lyrics/*.md   (nested)
//         j:/jubileepraise.com/music/<CODE-slug>/lyrics/*.md             (flat)
//     A full walk takes minutes across 344 albums, so the index is cached in
//     data/todo-index.json and only rebuilt on explicit refresh.
//   * Every lyric edit is journalled before/after into lyrics-changes.json,
//     written beside the .md in the album's own lyrics/ folder so the history
//     travels with the asset.
// ============================================================================

const fs = require('fs');
const path = require('path');

const DRIVE = process.env.JUBILEEPRAISE_DRIVE || 'J:\\';
const MAX_MP3_BYTES = 60 * 1024 * 1024;

let DATA_DIR = null;
let PUBLIC_DIR = null;
function configure(opts) { DATA_DIR = opts.dataDir; PUBLIC_DIR = opts.publicDir; }

// ---------------------------------------------------------------- json store
function dataPath(file) { return path.join(DATA_DIR, file); }
function readJson(file, fallback) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const fp = dataPath(file);
        if (!fs.existsSync(fp)) return JSON.parse(JSON.stringify(fallback));
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch { return JSON.parse(JSON.stringify(fallback)); }
}
function writeJson(file, value) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(dataPath(file), JSON.stringify(value, null, 2));
        return true;
    } catch { return false; }
}

// ------------------------------------------------------------------ indexing
// Walk each property root looking for */lyrics/*-lyrics.md. Depth-bounded so a
// stray deep tree cannot make this run forever.
function walkForLyrics(root, out, depth) {
    if (depth > 5) return;
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const dir = path.join(root, e.name);
        if (e.name.toLowerCase() === 'lyrics') {
            let files = [];
            try { files = fs.readdirSync(dir).filter(f => /-lyrics\.md$/i.test(f)); } catch {}
            if (files.length) {
                const albumDir = path.dirname(dir);
                const folder = path.basename(albumDir);
                const code = (folder.match(/^([A-Z]{4}\d{4}[A-Z]{2})/) || [])[1] || folder;
                out.push({
                    code,
                    folder,
                    mdPath: path.join(dir, files[0]),
                    lyricsDir: dir,
                    albumDir,
                    tracksDir: path.join(albumDir, 'tracks'),
                    property: propertyOf(albumDir),
                    artistFolder: artistFolderOf(albumDir)
                });
            }
            continue;
        }
        walkForLyrics(dir, out, depth + 1);
    }
}
// Drive-relative path — the ONLY unique key. 87 album codes collide across the
// drive (175 albums), and some share a folder name too, so code alone is unsafe.
function relId(albumDir) {
    return albumDir.replace(/^[A-Za-z]:[\\/]/, '').replace(/\\/g, '/');
}

function propertyOf(albumDir) {
    const rel = albumDir.replace(/^[A-Za-z]:[\\/]/, '').split(/[\\/]/);
    return rel[0] || '';
}
function artistFolderOf(albumDir) {
    const parts = albumDir.split(/[\\/]/);
    const i = parts.lastIndexOf('music');
    // .../music/<artist>/<album>  → artist ; .../music/<album> → ''
    return (i >= 0 && parts.length - i === 3) ? parts[i + 1] : '';
}

function buildIndex() {
    const roots = [];
    let props = [];
    try { props = fs.readdirSync(DRIVE, { withFileTypes: true }).filter(d => d.isDirectory()); } catch {}
    for (const p of props) {
        const musicDir = path.join(DRIVE, p.name, 'music');
        if (fs.existsSync(musicDir)) roots.push(musicDir);
    }
    const found = [];
    for (const r of roots) walkForLyrics(r, found, 0);

    const albums = found.map(a => {
        let title = a.folder.replace(/^[A-Z]{4}\d{4}[A-Z]{2}-/, '').replace(/-/g, ' ');
        let artist = a.artistFolder ? a.artistFolder.replace(/-/g, ' ') : '';
        try {
            const head = fs.readFileSync(a.mdPath, 'utf8').slice(0, 4000);
            const t = head.match(/^\*\*Album:\*\*\s*(.+)$/m);           if (t) title = t[1].trim();
            const c = head.match(/^\*\*Album Code:\*\*\s*(.+)$/m);
            if (c && /^[A-Z]{4}\d{4}[A-Z]{2}$/.test(c[1].trim())) a.code = c[1].trim();
            const ar = head.match(/^ARTIST:\s*(.+)$/m);                 if (ar) artist = ar[1].trim();
        } catch {}
        return {
            id: relId(a.albumDir),
            code: a.code, title, artist,
            property: a.property,
            folder: a.folder,
            mdPath: a.mdPath,
            lyricsDir: a.lyricsDir,
            albumDir: a.albumDir,
            tracksDir: a.tracksDir
        };
    });
    albums.sort((x, y) => (x.property + x.code).localeCompare(y.property + y.code));
    const seen = {};
    albums.forEach(a => { (seen[a.code] = seen[a.code] || []).push(a.id); });
    const duplicate_codes = Object.entries(seen).filter(([, v]) => v.length > 1)
        .map(([code, ids]) => ({ code, ids }));
    const index = {
        built_at: new Date().toISOString(), drive: DRIVE,
        count: albums.length, duplicate_codes, albums
    };
    writeJson('todo-index.json', index);
    return index;
}
function getIndex(refresh) {
    if (refresh) return buildIndex();
    const cached = readJson('todo-index.json', null);
    if (cached && Array.isArray(cached.albums) && cached.albums.length) return cached;
    return buildIndex();
}
// Resolve by id (exact, always safe) or by code (only when it is unique).
// Returns { album } | { ambiguous: [...] } | { missing: true }
function resolveAlbum(ref) {
    if (!ref) return { missing: true };
    const tryIdx = (idx) => {
        const byId = idx.albums.find(a => a.id === ref);
        if (byId) return { album: byId };
        const byCode = idx.albums.filter(a => a.code === ref);
        if (byCode.length === 1) return { album: byCode[0] };
        if (byCode.length > 1) return {
            ambiguous: byCode.map(a => ({ id: a.id, code: a.code, title: a.title, property: a.property, folder: a.folder }))
        };
        return null;
    };
    let r = tryIdx(getIndex(false));
    if (r && r.album && fs.existsSync(r.album.mdPath)) return r;
    if (r && r.ambiguous) return r;
    r = tryIdx(buildIndex());          // stale cache — rebuild once
    if (r && r.album && fs.existsSync(r.album.mdPath)) return r;
    if (r && r.ambiguous) return r;
    return { missing: true };
}

// Back-compat shim for internal callers that only need the album or null.
function findAlbum(ref) { const r = resolveAlbum(ref); return r.album || null; }

// ------------------------------------------------------------------- parsing
const META_KEYS = [
    'ARTIST', 'ARCHETYPE', 'Styles', 'VOCAL GENDER', 'Weirdness', 'Style Influence',
    'Faith-Focus Rating', 'Praise vs. Worship Rating', 'Prophetic Declaration Quotient',
    'Prophetic Declaration Rule', 'Earworm Rating', 'Estimated Length', 'Save To'
];

function parseAlbumMd(md) {
    const lines = md.split(/\r?\n/);

    const header = {};
    const grab = (label) => {
        const re = new RegExp('^\\*\\*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\*\\*\\s*(.+)$', 'm');
        const m = md.match(re); return m ? m[1].trim() : '';
    };
    header.album = grab('Album');
    header.code = grab('Album Code');
    header.updated = grab('Lyrics Last Updated');
    header.anchors = grab('Theological Anchors');
    header.dna = grab('Identity DNA Preserved');
    const bpmLine = md.match(/^\*\*Opener BPM:\*\*.*$/m);
    header.bpmLine = bpmLine ? bpmLine[0].replace(/\*\*/g, '') : '';

    // track block boundaries
    const starts = [];
    lines.forEach((l, i) => { if (/^SONG TITLE:\s*/.test(l)) starts.push(i); });
    const summaryAt = lines.findIndex(l => /^#\s*ALBUM SUMMARY/.test(l));
    const endOfTracks = summaryAt >= 0 ? summaryAt : lines.length;

    const tracks = starts.map((s, k) => {
        const e = (k + 1 < starts.length) ? starts[k + 1] : endOfTracks;
        const block = lines.slice(s, e);
        const rawTitle = block[0].replace(/^SONG TITLE:\s*/, '').trim();
        const numMatch = rawTitle.match(/^(\d+)\s+(.*)$/);
        const number = numMatch ? parseInt(numMatch[1], 10) : (k + 1);
        const title = numMatch ? numMatch[2].trim() : rawTitle;

        const meta = {};
        for (const key of META_KEYS) {
            const re = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*(.*)$');
            const found = block.find(l => re.test(l));
            meta[key] = found ? found.match(re)[1].trim() : '';
        }

        // lyric body: after the LYRICS: line, up to the Styles: line
        const li = block.findIndex(l => /^LYRICS:\s*$/.test(l));
        const si = block.findIndex(l => /^Styles:\s*/.test(l));
        let lyrics = '', padBefore = 0, padAfter = 0;
        if (li >= 0 && si > li) {
            const span = block.slice(li + 1, si);
            // Preserve whatever padding THIS file uses around the body. The house
            // format is one blank line either side, but older albums on the drive
            // differ, and assuming a shape rewrites bytes we were not asked to touch.
            while (padBefore < span.length && span[padBefore].trim() === '') padBefore++;
            let end = span.length;
            while (end > padBefore && span[end - 1].trim() === '') { end--; padAfter++; }
            lyrics = span.slice(padBefore, end).join('\n');
        }

        return {
            index: k,
            number, title, rawTitle,
            lyrics,
            meta,
            padBefore, padAfter,
            lineStart: s, lineEnd: e,
            lyricStart: li >= 0 ? s + li + 1 : -1,
            lyricEnd: si > 0 ? s + si : -1
        };
    });

    return { header, tracks };
}

// Replace one track's lyric body in the raw markdown, preserving everything else.
// Character offsets for every line, keeping each line's own terminator so files
// with mixed CRLF/LF survive a round trip.
function lineOffsets(md) {
    const offs = []; const re = /\r\n|\n|\r/g;
    let m, start = 0;
    while ((m = re.exec(md)) !== null) { offs.push({ start, end: m.index }); start = re.lastIndex; }
    offs.push({ start, end: md.length });
    return offs;
}

// Replace ONE track's lyric body by splicing that span only. Everything outside
// the span keeps its original bytes — line endings, spacing, trailing newline —
// because the file is never split and rejoined.
// Character offsets for every line, keeping each line's own terminator so files
// with mixed CRLF/LF survive a round trip.
function lineOffsets(md) {
    const offs = []; const re = /\r\n|\n|\r/g;
    let m, start = 0;
    while ((m = re.exec(md)) !== null) { offs.push({ start, end: m.index }); start = re.lastIndex; }
    offs.push({ start, end: md.length });
    return offs;
}

// Replace ONE track's lyric body by splicing that span only. Everything outside
// the span keeps its original bytes — line endings, spacing, trailing newline —
// because the file is never split and rejoined.
// ref: { index } addresses a block by position (always unambiguous), or a plain
// number addresses by track number (only safe when that number appears once —
// some legacy albums on the drive contain every track block twice).
function replaceTrackLyrics(md, ref, newLyrics) {
    const parsed = parseAlbumMd(md);
    let t = null;
    if (ref && typeof ref === 'object' && Number.isInteger(ref.index)) {
        t = parsed.tracks[ref.index] || null;
    } else {
        const hits = parsed.tracks.filter(x => x.number === Number(ref));
        if (hits.length > 1) return { ambiguous: hits.map(h => ({ index: h.index, number: h.number, title: h.title })) };
        t = hits[0] || null;
    }
    if (!t || t.lyricStart < 0 || t.lyricEnd < 0) return null;

    const body = String(newLyrics).replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');

    // Identity short-circuit: saving a track with its own lyrics is a no-op and
    // must return the file untouched, byte for byte.
    if (body === t.lyrics) return { text: md, previous: t.lyrics, lossless: true, unchanged: true };

    const offs = lineOffsets(md);
    if (t.lyricStart >= offs.length || t.lyricEnd >= offs.length) return null;
    const from = offs[t.lyricStart].start;   // the blank line after "LYRICS:"
    const to   = offs[t.lyricEnd].start;     // the "Styles:" line itself

    // Rebuild with the padding this file actually used, and its own terminator.
    const crlf = (md.match(/\r\n/g) || []).length;
    const EOL = crlf > (offs.length / 2) ? '\r\n' : '\n';
    const pad = n => Array(n).fill('');
    const block = [...pad(t.padBefore), ...body.split('\n'), ...pad(t.padAfter)]
        .map(l => l + EOL).join('');

    return {
        text: md.slice(0, from) + block + md.slice(to),
        previous: t.lyrics,
        lossless: true
    };
}

// -------------------------------------------------------------------- tracks
function mp3ForTrack(album, track) {
    const dir = album.tracksDir;
    if (!fs.existsSync(dir)) return null;
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => /\.mp3$/i.test(f)); } catch { return null; }
    const nn = String(track.number).padStart(2, '0');
    const hit = files.find(f => f.startsWith(nn + ' ') || f.startsWith(nn + '-') || f.startsWith(nn + '.'));
    if (!hit) return null;
    let size = 0, mtime = null;
    try { const st = fs.statSync(path.join(dir, hit)); size = st.size; mtime = st.mtime.toISOString(); } catch {}
    return { file: hit, size, mtime };
}

// ------------------------------------------------------------------- history
function historyPath(album) { return path.join(album.lyricsDir, 'lyrics-changes.json'); }
function readHistory(album) {
    try {
        const fp = historyPath(album);
        if (!fs.existsSync(fp)) return { album: album.code, changes: [] };
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch { return { album: album.code, changes: [] }; }
}
function appendHistory(album, entry) {
    const h = readHistory(album);
    if (!Array.isArray(h.changes)) h.changes = [];
    h.album = album.code;
    h.changes.push(entry);
    try { fs.writeFileSync(historyPath(album), JSON.stringify(h, null, 2)); return true; }
    catch { return false; }
}

// --------------------------------------------------------------------- utils
function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
}
function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const chunks = []; let total = 0;
        req.on('data', c => {
            total += c.length;
            if (total > limit) { reject(new Error('too large')); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}
function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '').trim(); }

// -------------------------------------------------------------------- router
function handle(req, res, pathname, query) {
    // ---- album index -------------------------------------------------------
    if (pathname === '/api/todo/index' && req.method === 'GET') {
        const idx = getIndex(query.get('refresh') === '1');
        sendJson(res, 200, {
            built_at: idx.built_at, drive: idx.drive, count: idx.count,
            duplicate_codes: idx.duplicate_codes || [],
            albums: idx.albums.map(a => ({
                id: a.id, code: a.code, title: a.title, artist: a.artist,
                property: a.property, folder: a.folder, mdPath: a.mdPath
            }))
        });
        return true;
    }

    // ---- workers + assignments --------------------------------------------
    if (pathname === '/api/todo/workers') {
        const FALLBACK = {
            workers: [
                { id: 'w-unassigned', name: 'Unassigned', role: 'inbox', assigned: [] }
            ]
        };
        if (req.method === 'GET') { sendJson(res, 200, readJson('todo-workers.json', FALLBACK)); return true; }
        if (req.method === 'POST' || req.method === 'PUT') {
            readBody(req, 2 * 1024 * 1024).then(buf => {
                let body; try { body = JSON.parse(buf.toString('utf8')); }
                catch { return sendJson(res, 400, { error: 'invalid json' }); }
                if (!body || !Array.isArray(body.workers)) return sendJson(res, 400, { error: 'workers[] required' });
                const clean = {
                    workers: body.workers.map(w => ({
                        id: String(w.id || '').slice(0, 64) || ('w-' + Date.now()),
                        name: String(w.name || 'Unnamed').slice(0, 80),
                        role: String(w.role || '').slice(0, 40),
                        assigned: Array.isArray(w.assigned) ? w.assigned.map(String).slice(0, 500) : []
                    }))
                };
                writeJson('todo-workers.json', clean);
                sendJson(res, 200, clean);
            }).catch(() => sendJson(res, 413, { error: 'body too large' }));
            return true;
        }
    }

    // ---- one album, fully parsed ------------------------------------------
    if (pathname === '/api/todo/album' && req.method === 'GET') {
        const ref = query.get('id') || query.get('code');
        if (!ref) return sendJson(res, 400, { error: 'missing ?id= or ?code=' }), true;
        const r = resolveAlbum(ref);
        if (r.ambiguous) return sendJson(res, 409, { error: 'album code is not unique — pass ?id=', candidates: r.ambiguous }), true;
        if (!r.album) return sendJson(res, 404, { error: 'album not found on ' + DRIVE, ref }), true;
        const album = r.album;
        let md; try { md = fs.readFileSync(album.mdPath, 'utf8'); }
        catch (e) { return sendJson(res, 500, { error: 'cannot read md', detail: String(e.message) }), true; }
        const parsed = parseAlbumMd(md);
        const hist = readHistory(album);
        const counts = {};
        parsed.tracks.forEach(t => { counts[t.number] = (counts[t.number] || 0) + 1; });
        const duplicated = Object.keys(counts).filter(n => counts[n] > 1).map(Number);
        const tracks = parsed.tracks.map(t => ({
            index: t.index, duplicate: counts[t.number] > 1,
            number: t.number, title: t.title, lyrics: t.lyrics, meta: t.meta,
            mp3: mp3ForTrack(album, t),
            edits: hist.changes.filter(c => c.track === t.number).length
        }));
        sendJson(res, 200, {
            id: album.id, code: album.code, property: album.property, folder: album.folder,
            mdPath: album.mdPath, albumDir: album.albumDir, tracksDir: album.tracksDir,
            header: parsed.header, tracks,
            duplicate_track_numbers: duplicated,
            history_count: (hist.changes || []).length
        });
        return true;
    }

    // ---- save a lyric edit (journalled before/after) ------------------------
    if (pathname === '/api/todo/track' && (req.method === 'POST' || req.method === 'PUT')) {
        readBody(req, 4 * 1024 * 1024).then(buf => {
            let body; try { body = JSON.parse(buf.toString('utf8')); }
            catch { return sendJson(res, 400, { error: 'invalid json' }); }
            const { id, code, track, index, lyrics, editor } = body || {};
            const ref = id || code;
            if (!ref || !track) return sendJson(res, 400, { error: 'id/code and track required' });
            const ra = resolveAlbum(ref);
            if (ra.ambiguous) return sendJson(res, 409, { error: 'album code is not unique — pass id', candidates: ra.ambiguous });
            if (!ra.album) return sendJson(res, 404, { error: 'album not found', ref });
            const album = ra.album;

            let md; try { md = fs.readFileSync(album.mdPath, 'utf8'); }
            catch (e) { return sendJson(res, 500, { error: 'cannot read md', detail: String(e.message) }); }

            const trackRef = Number.isInteger(index) ? { index } : Number(track);
            const out = replaceTrackLyrics(md, trackRef, lyrics == null ? '' : lyrics);
            if (!out) return sendJson(res, 422, { error: 'track block not found', track, index });
            if (out.ambiguous) return sendJson(res, 409, {
                error: 'this album contains more than one block for that track number — pass index',
                candidates: out.ambiguous
            });
            if (!out.lossless) return sendJson(res, 422, {
                error: 'refusing to write — this file\'s layout is not one this editor can round-trip safely',
                track: Number(track), mdPath: album.mdPath
            });
            if (out.previous === String(lyrics).replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, ''))
                return sendJson(res, 200, { ok: true, unchanged: true, track: Number(track) });

            try { fs.writeFileSync(album.mdPath, out.text); }
            catch (e) { return sendJson(res, 500, { error: 'cannot write md', detail: String(e.message) }); }

            appendHistory(album, {
                at: new Date().toISOString(),
                editor: String(editor || 'unknown').slice(0, 80),
                track: Number(track),
                index: Number.isInteger(index) ? index : null,
                field: 'lyrics',
                before: out.previous,
                after: String(lyrics).replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '')
            });
            sendJson(res, 200, { ok: true, track: Number(track), historyFile: historyPath(album) });
        }).catch(() => sendJson(res, 413, { error: 'body too large' }));
        return true;
    }

    // ---- change history ----------------------------------------------------
    if (pathname === '/api/todo/history' && req.method === 'GET') {
        const ref = query.get('id') || query.get('code');
        if (!ref) return sendJson(res, 400, { error: 'missing ?id= or ?code=' }), true;
        const r = resolveAlbum(ref);
        if (r.ambiguous) return sendJson(res, 409, { error: 'album code is not unique — pass ?id=', candidates: r.ambiguous }), true;
        if (!r.album) return sendJson(res, 404, { error: 'album not found', ref }), true;
        const album = r.album;
        const h = readHistory(album);
        const track = query.get('track');
        let changes = h.changes || [];
        if (track) changes = changes.filter(c => String(c.track) === String(track));
        sendJson(res, 200, { code: album.code, file: historyPath(album), count: changes.length, changes: changes.slice().reverse() });
        return true;
    }

    // ---- MP3 ingest: raw binary PUT ---------------------------------------
    // Writes the public copy first (the website), then mirrors to J: (canonical).
    if (pathname === '/api/todo/upload' && (req.method === 'POST' || req.method === 'PUT')) {
        const ref = query.get('id') || query.get('code');
        const trackNo = parseInt(query.get('track'), 10);
        const title = safeName(query.get('title') || '');
        if (!ref || !trackNo) return sendJson(res, 400, { error: 'id/code and track required' }), true;
        const ra = resolveAlbum(ref);
        if (ra.ambiguous) return sendJson(res, 409, { error: 'album code is not unique — pass ?id=', candidates: ra.ambiguous }), true;
        if (!ra.album) return sendJson(res, 404, { error: 'album not found', ref }), true;
        const album = ra.album;

        readBody(req, MAX_MP3_BYTES).then(buf => {
            if (!buf.length) return sendJson(res, 400, { error: 'empty body' });
            // ID3 or MPEG frame sync — reject anything that is plainly not audio
            const isMp3 = buf.slice(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
            if (!isMp3) return sendJson(res, 415, { error: 'not an mp3' });

            const nn = String(trackNo).padStart(2, '0');
            const fileName = `${nn} ${title || 'Track ' + nn}.mp3`;

            // 1. website copy
            const webRel = path.join('music', 'tracks', album.property, album.folder);
            const webDir = path.join(PUBLIC_DIR, webRel);
            let webUrl = null;
            try {
                fs.mkdirSync(webDir, { recursive: true });
                fs.writeFileSync(path.join(webDir, fileName), buf);
                webUrl = '/' + path.join(webRel, fileName).replace(/\\/g, '/');
            } catch (e) {
                return sendJson(res, 500, { error: 'website write failed', detail: String(e.message) });
            }

            // 2. mirror down to J: — canonical
            let drivePath = null, driveError = null;
            try {
                fs.mkdirSync(album.tracksDir, { recursive: true });
                drivePath = path.join(album.tracksDir, fileName);
                fs.writeFileSync(drivePath, buf);
            } catch (e) { driveError = String(e.message); drivePath = null; }

            appendHistory(album, {
                at: new Date().toISOString(),
                editor: String(query.get('editor') || 'unknown').slice(0, 80),
                track: trackNo,
                field: 'mp3',
                before: null,
                after: fileName,
                bytes: buf.length,
                website: webUrl,
                drive: drivePath,
                drive_error: driveError
            });

            sendJson(res, driveError ? 207 : 200, {
                ok: !driveError, file: fileName, bytes: buf.length,
                website: webUrl, drive: drivePath, drive_error: driveError
            });
        }).catch(() => sendJson(res, 413, { error: 'file too large (60 MB max)' }));
        return true;
    }

    return false;
}

module.exports = { configure, handle, parseAlbumMd, replaceTrackLyrics, buildIndex, resolveAlbum };
