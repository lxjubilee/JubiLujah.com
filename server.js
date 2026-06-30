/**
 * Jubilujah.com - Coming Soon Server
 * Jubilujah.com - Music & Worship
 * Port: 3119
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3119;
const SITE_NAME = 'Jubilujah.com';

// MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg'
};

// Coming Soon HTML
const COMING_SOON_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${SITE_NAME} - Coming Soon</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: #fff;
            text-align: center;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            animation: fadeIn 1s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .logo {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(90deg, #e94560, #f39c12);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .tagline {
            font-size: 1.2rem;
            color: #a0a0a0;
            margin-bottom: 2rem;
        }
        .coming-soon {
            display: inline-block;
            padding: 15px 40px;
            background: linear-gradient(90deg, #e94560, #f39c12);
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 2px;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(233, 69, 96, 0.4); }
            50% { transform: scale(1.02); box-shadow: 0 0 30px rgba(233, 69, 96, 0.6); }
        }
        .footer {
            margin-top: 3rem;
            color: #666;
            font-size: 0.9rem;
        }
        .footer a { color: #e94560; text-decoration: none; }
        .footer a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">&#128640;</div>
        <h1>${SITE_NAME.replace('.com', '')}</h1>
        <p class="tagline">Something amazing is on the way</p>
        <div class="coming-soon">Coming Soon</div>
        <p class="footer">Part of the <a href="https://JubileeVerse.com">Jubilee Enterprise</a> family</p>
    </div>
</body>
</html>`;

// Serve static files from /public/ (single web root, no cross-drive aliases)
// + lightweight /api/cdn-probe?url=... endpoint that HEAD-checks a CDN MP3
const PUBLIC_DIR = path.join(__dirname, 'public');
const https = require('https');
const httpReq = require('http');
const { URL } = require('url');

const CDN_ALLOWED_HOST = 'cdn.jubileeverse.com';

// In-memory probe cache (URL -> { ok, ts }) with 10-minute TTL
const probeCache = new Map();
const PROBE_TTL_MS = 10 * 60 * 1000;

function probeCdn(url) {
    return new Promise(resolve => {
        let u;
        try { u = new URL(url); } catch { return resolve({ ok: false, status: 0, reason: 'bad-url' }); }
        if (u.hostname !== CDN_ALLOWED_HOST) return resolve({ ok: false, status: 0, reason: 'host-not-allowed' });

        const cached = probeCache.get(url);
        if (cached && (Date.now() - cached.ts) < PROBE_TTL_MS) return resolve(cached.result);

        const lib = u.protocol === 'https:' ? https : httpReq;
        const req = lib.request({
            method: 'HEAD',
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            timeout: 5000
        }, response => {
            const ok = response.statusCode >= 200 && response.statusCode < 400;
            const result = { ok, status: response.statusCode, contentType: response.headers['content-type'] || null, contentLength: response.headers['content-length'] ? Number(response.headers['content-length']) : null };
            probeCache.set(url, { result, ts: Date.now() });
            resolve(result);
            response.resume();
        });
        req.on('error', err => resolve({ ok: false, status: 0, reason: err.code || 'error' }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, reason: 'timeout' }); });
        req.end();
    });
}

// ============================================================================
// Build Spec §19 — Ratings + Comments + Nominations + Awards (stub APIs)
// ============================================================================
// JSON file storage at W:/Jubilujah.com/data/ (created on first hit).
// Mock single-user context until real auth lands.
// ============================================================================

const DATA_DIR = path.join(__dirname, 'data');
const CURRENT_USER_ID = '00000000-0000-0000-0000-000000000001';

const AWARD_CATEGORY_SEED = [
    { name: 'Song of the Year',                            description: 'The single best song of the year, regardless of style.',                            rateable_type: 'song'  },
    { name: 'Album of the Year',                           description: 'The single best album of the year, regardless of style.',                           rateable_type: 'album' },
    { name: 'Most Anointed Lyric',                         description: 'The song whose lyric carries the heaviest anointing.',                              rateable_type: 'song'  },
    { name: 'Best Worship Anthem',                         description: 'The standout congregational worship anthem of the year.',                           rateable_type: 'song'  },
    { name: 'Best Prophetic Song',                         description: 'The song that most powerfully carries a prophetic word.',                           rateable_type: 'song'  },
    { name: 'Best Declaration Song',                       description: 'The song that most powerfully equips believers to declare truth.',                  rateable_type: 'song'  },
    { name: "Best Children's Song",                        description: "The standout song written for children.",                                            rateable_type: 'song'  },
    { name: "Best Children's Album",                       description: "The standout album written for children.",                                           rateable_type: 'album' },
    { name: 'Best Bilingual or Multilingual Production',   description: 'The standout production featuring more than one language.',                         rateable_type: 'song'  },
    { name: 'Best Cinematic Production',                   description: 'The most cinematic, film-scored production of the year.',                           rateable_type: 'song'  },
    { name: 'Breakthrough Album of the Year',              description: 'The breakthrough album of the year from a new or rising artist.',                   rateable_type: 'album' }
];

function ensureDataDir() {
    try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function readJson(file, fallback) {
    ensureDataDir();
    const fp = path.join(DATA_DIR, file);
    try {
        if (!fs.existsSync(fp)) {
            fs.writeFileSync(fp, JSON.stringify(fallback, null, 2));
            return JSON.parse(JSON.stringify(fallback));
        }
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch {
        return JSON.parse(JSON.stringify(fallback));
    }
}

function writeJson(file, value) {
    ensureDataDir();
    const fp = path.join(DATA_DIR, file);
    try { fs.writeFileSync(fp, JSON.stringify(value, null, 2)); return true; }
    catch { return false; }
}

let _seeded = false;
function seedOnce() {
    if (_seeded) return;
    _seeded = true;
    ensureDataDir();
    readJson('ratings.json', []);
    readJson('comments.json', []);
    readJson('nominations.json', []);

    // award_categories — seed exactly once with the 11 spec categories
    const catFp = path.join(DATA_DIR, 'award_categories.json');
    let categories;
    if (!fs.existsSync(catFp)) {
        categories = AWARD_CATEGORY_SEED.map(c => ({
            id: crypto.randomUUID(),
            name: c.name,
            description: c.description,
            rateable_type: c.rateable_type,
            active: true
        }));
        writeJson('award_categories.json', categories);
    } else {
        categories = readJson('award_categories.json', []);
    }

    // award_periods — one open period per category for 2026
    const periodFp = path.join(DATA_DIR, 'award_periods.json');
    if (!fs.existsSync(periodFp)) {
        const periods = categories.map(cat => ({
            id: crypto.randomUUID(),
            category_id: cat.id,
            year: 2026,
            opens_at: '2026-01-01T00:00:00.000Z',
            closes_at: '2026-12-31T23:59:59.999Z',
            status: 'open'
        }));
        writeJson('award_periods.json', periods);
    }
}

function sendJson(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (!body) return resolve({});
            try { resolve(JSON.parse(body)); }
            catch { reject(new Error('bad-json')); }
        });
        req.on('error', reject);
    });
}

function aggregateRatings(ratings, type, id, userId) {
    const forObj = ratings.filter(r => r.rateable_type === type && r.rateable_id === id);
    const count = forObj.length;
    const sum = forObj.reduce((a, r) => a + r.stars, 0);
    const avg = count ? +(sum / count).toFixed(2) : 0;
    const distribution = [1, 2, 3, 4, 5].map(s => ({
        stars: s,
        count: forObj.filter(r => r.stars === s).length
    }));
    const mine = forObj.find(r => r.user_id === userId) || null;
    const user_rating = mine ? { stars: mine.stars, note: mine.note || null } : null;
    return { type, id, avg, count, distribution, user_rating };
}

// Matches /api/<segment>/<a>/<b>  or /api/<segment>/<a>
function matchPath(pathname, prefix) {
    if (!pathname.startsWith(prefix)) return null;
    const rest = pathname.slice(prefix.length);
    if (!rest) return [];
    return rest.replace(/^\/+|\/+$/g, '').split('/');
}

function handleStubApi(req, res, pathname) {
    seedOnce();

    // ---------------- Ratings ----------------
    const ratingParts = matchPath(pathname, '/api/ratings');
    if (ratingParts && ratingParts.length === 2) {
        const [type, id] = ratingParts;
        if (!['song', 'album'].includes(type)) {
            sendJson(res, 400, { error: 'type must be song or album' });
            return true;
        }

        if (req.method === 'GET') {
            const ratings = readJson('ratings.json', []);
            sendJson(res, 200, aggregateRatings(ratings, type, id, CURRENT_USER_ID));
            return true;
        }

        if (req.method === 'PUT') {
            readBody(req).then(body => {
                const stars = Number(body.stars);
                if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
                    sendJson(res, 400, { error: 'stars must be an integer 1-5' });
                    return;
                }
                const note = typeof body.note === 'string' ? body.note : null;
                const ratings = readJson('ratings.json', []);
                const now = new Date().toISOString();
                const existing = ratings.find(r =>
                    r.rateable_type === type && r.rateable_id === id && r.user_id === CURRENT_USER_ID
                );
                let saved;
                if (existing) {
                    existing.stars = stars;
                    existing.note = note;
                    existing.updated_at = now;
                    saved = existing;
                } else {
                    saved = {
                        id: crypto.randomUUID(),
                        rateable_type: type,
                        rateable_id: id,
                        user_id: CURRENT_USER_ID,
                        stars,
                        note,
                        created_at: now,
                        updated_at: now
                    };
                    ratings.push(saved);
                }
                writeJson('ratings.json', ratings);
                sendJson(res, 200, {
                    rating: saved,
                    aggregate: aggregateRatings(ratings, type, id, CURRENT_USER_ID)
                });
            }).catch(() => sendJson(res, 400, { error: 'bad json' }));
            return true;
        }

        if (req.method === 'DELETE') {
            const ratings = readJson('ratings.json', []);
            const next = ratings.filter(r =>
                !(r.rateable_type === type && r.rateable_id === id && r.user_id === CURRENT_USER_ID)
            );
            writeJson('ratings.json', next);
            sendJson(res, 200, { aggregate: aggregateRatings(next, type, id, CURRENT_USER_ID) });
            return true;
        }

        sendJson(res, 405, { error: 'method not allowed' });
        return true;
    }

    // ---------------- Comments by object ----------------
    const commentObjParts = matchPath(pathname, '/api/comments');
    if (commentObjParts && commentObjParts.length === 2) {
        const [type, id] = commentObjParts;
        if (!['song', 'album'].includes(type)) {
            sendJson(res, 400, { error: 'type must be song or album' });
            return true;
        }

        if (req.method === 'GET') {
            const comments = readJson('comments.json', []);
            const list = comments
                .filter(c => c.rateable_type === type && c.rateable_id === id && !c.deleted_at)
                .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
                .map(c => ({
                    id: c.id,
                    author_user_id: c.author_user_id,
                    body: c.body,
                    parent_id: c.parent_id || null,
                    lyric_line: c.lyric_line || null,
                    mentions: c.mentions || [],
                    created_at: c.created_at,
                    edited: (c.edit_count || 0) > 0
                }));
            sendJson(res, 200, list);
            return true;
        }

        if (req.method === 'POST') {
            readBody(req).then(body => {
                const text = typeof body.body === 'string' ? body.body.trim() : '';
                if (!text) { sendJson(res, 400, { error: 'body required' }); return; }
                const now = new Date().toISOString();
                const comments = readJson('comments.json', []);
                const created = {
                    id: crypto.randomUUID(),
                    rateable_type: type,
                    rateable_id: id,
                    author_user_id: CURRENT_USER_ID,
                    body: text,
                    parent_id: body.parent_id || null,
                    lyric_line: Number.isInteger(body.lyric_line) ? body.lyric_line : null,
                    mentions: Array.isArray(body.mentions) ? body.mentions : [],
                    created_at: now,
                    updated_at: now,
                    edit_count: 0,
                    deleted_at: null
                };
                comments.push(created);
                writeJson('comments.json', comments);
                sendJson(res, 201, {
                    id: created.id,
                    author_user_id: created.author_user_id,
                    body: created.body,
                    parent_id: created.parent_id,
                    lyric_line: created.lyric_line,
                    mentions: created.mentions,
                    created_at: created.created_at,
                    edited: false
                });
            }).catch(() => sendJson(res, 400, { error: 'bad json' }));
            return true;
        }

        sendJson(res, 405, { error: 'method not allowed' });
        return true;
    }

    // ---------------- Comment by id (PATCH / DELETE) ----------------
    if (commentObjParts && commentObjParts.length === 1) {
        const commentId = commentObjParts[0];
        const comments = readJson('comments.json', []);
        const idx = comments.findIndex(c => c.id === commentId);
        if (idx === -1) { sendJson(res, 404, { error: 'comment not found' }); return true; }
        const comment = comments[idx];

        if (req.method === 'PATCH') {
            if (comment.author_user_id !== CURRENT_USER_ID) {
                sendJson(res, 403, { error: 'not author' }); return true;
            }
            readBody(req).then(body => {
                const text = typeof body.body === 'string' ? body.body.trim() : '';
                if (!text) { sendJson(res, 400, { error: 'body required' }); return; }
                comment.body = text;
                comment.updated_at = new Date().toISOString();
                comment.edit_count = (comment.edit_count || 0) + 1;
                writeJson('comments.json', comments);
                sendJson(res, 200, {
                    id: comment.id,
                    author_user_id: comment.author_user_id,
                    body: comment.body,
                    parent_id: comment.parent_id || null,
                    lyric_line: comment.lyric_line || null,
                    mentions: comment.mentions || [],
                    created_at: comment.created_at,
                    edited: true
                });
            }).catch(() => sendJson(res, 400, { error: 'bad json' }));
            return true;
        }

        if (req.method === 'DELETE') {
            if (comment.author_user_id !== CURRENT_USER_ID) {
                sendJson(res, 403, { error: 'not author' }); return true;
            }
            comment.deleted_at = new Date().toISOString();
            writeJson('comments.json', comments);
            sendJson(res, 200, { id: comment.id, deleted_at: comment.deleted_at });
            return true;
        }

        sendJson(res, 405, { error: 'method not allowed' });
        return true;
    }

    // ---------------- Awards: categories ----------------
    if (pathname === '/api/awards/categories' && req.method === 'GET') {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const onlyActive = params.get('active') === 'true';
        let categories = readJson('award_categories.json', []);
        if (onlyActive) categories = categories.filter(c => c.active);
        sendJson(res, 200, categories);
        return true;
    }

    // ---------------- Awards: periods by year ----------------
    const periodParts = matchPath(pathname, '/api/awards/periods');
    if (periodParts && periodParts.length === 1 && req.method === 'GET') {
        const year = Number(periodParts[0]);
        if (!Number.isInteger(year)) {
            sendJson(res, 400, { error: 'year must be an integer' });
            return true;
        }
        const periods = readJson('award_periods.json', []).filter(p => p.year === year);
        const categories = readJson('award_categories.json', []);
        const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
        const joined = periods.map(p => {
            const cat = catMap[p.category_id] || null;
            return {
                id: p.id,
                category_id: p.category_id,
                category_name: cat ? cat.name : null,
                category_description: cat ? cat.description : null,
                rateable_type: cat ? cat.rateable_type : null,
                year: p.year,
                opens_at: p.opens_at,
                closes_at: p.closes_at,
                status: p.status
            };
        });
        sendJson(res, 200, joined);
        return true;
    }

    // ---------------- Awards: nominations ----------------
    if (pathname === '/api/awards/nominations') {
        if (req.method === 'POST') {
            readBody(req).then(body => {
                const periodId = body.period_id;
                const type = body.rateable_type || body.type;
                const id = body.rateable_id || body.id;
                const reason = typeof body.reason === 'string' ? body.reason : '';
                if (!periodId) { sendJson(res, 400, { error: 'period_id required' }); return; }
                if (!['song', 'album'].includes(type)) {
                    sendJson(res, 400, { error: 'rateable_type must be song or album' }); return;
                }
                if (!id) { sendJson(res, 400, { error: 'rateable_id required' }); return; }

                const trimmedLen = reason.trim().length;
                if (trimmedLen < 250) {
                    sendJson(res, 422, {
                        error: 'reason too short',
                        message: `Justification must be at least 250 characters (after trim). Current length: ${trimmedLen}. Please add ${250 - trimmedLen} more characters explaining why this deserves the award.`,
                        current_length: trimmedLen,
                        required_length: 250
                    });
                    return;
                }

                const periods = readJson('award_periods.json', []);
                const period = periods.find(p => p.id === periodId);
                if (!period) { sendJson(res, 404, { error: 'period not found' }); return; }

                const nominations = readJson('nominations.json', []);
                const dup = nominations.find(n =>
                    n.period_id === periodId &&
                    n.rateable_type === type &&
                    n.rateable_id === id &&
                    n.nominator_id === CURRENT_USER_ID
                );
                if (dup) {
                    sendJson(res, 409, { error: 'duplicate nomination from same user for this object and period' });
                    return;
                }

                const created = {
                    id: crypto.randomUUID(),
                    period_id: periodId,
                    category_id: period.category_id,
                    rateable_type: type,
                    rateable_id: id,
                    nominator_id: CURRENT_USER_ID,
                    reason: reason,
                    created_at: new Date().toISOString()
                };
                nominations.push(created);
                writeJson('nominations.json', nominations);
                sendJson(res, 201, created);
            }).catch(() => sendJson(res, 400, { error: 'bad json' }));
            return true;
        }

        if (req.method === 'GET') {
            const params = new URL(req.url, 'http://localhost').searchParams;
            const yearQ = params.get('period');
            const categoryQ = params.get('category');
            const typeQ = params.get('type');
            const idQ = params.get('id');

            const nominations = readJson('nominations.json', []);
            const periods = readJson('award_periods.json', []);
            const periodMap = Object.fromEntries(periods.map(p => [p.id, p]));

            const filtered = nominations.filter(n => {
                const p = periodMap[n.period_id];
                if (yearQ && (!p || String(p.year) !== String(yearQ))) return false;
                if (categoryQ && (!p || p.category_id !== categoryQ)) return false;
                if (typeQ && n.rateable_type !== typeQ) return false;
                if (idQ && n.rateable_id !== idQ) return false;
                return true;
            });
            sendJson(res, 200, filtered);
            return true;
        }

        sendJson(res, 405, { error: 'method not allowed' });
        return true;
    }

    return false; // not a stub-api route
}

// /api/album?path=cat/artist/album-folder → returns album metadata + track list
// Reads the on-disk album folder under PUBLIC_DIR/music/albums/, parses tracks from
// the lyrics/ folder, constructs expected cdn.jubileeverse.com MP3 URLs.
function readAlbumListing(relPath) {
    // Security: confine to /music/albums/
    const albumDir = path.join(PUBLIC_DIR, 'music', 'albums', relPath);
    if (!albumDir.startsWith(path.join(PUBLIC_DIR, 'music', 'albums'))) {
        return { error: 'forbidden_path', status: 403 };
    }
    if (!fs.existsSync(albumDir) || !fs.statSync(albumDir).isDirectory()) {
        return { error: 'album_not_found', status: 404, attempted: albumDir };
    }

    const folderName = path.basename(albumDir);
    // Album code is first whitespace-separated token; rest is the title.
    const firstSpace = folderName.indexOf(' ');
    const albumCode = firstSpace > 0 ? folderName.substring(0, firstSpace) : folderName;
    const albumTitle = firstSpace > 0 ? folderName.substring(firstSpace + 1).trim() : folderName;

    // path is cat/artist/album-folder — pull cat + artist
    const parts = relPath.split('/').filter(Boolean);
    const category = parts[0] || '';
    const artistSlug = parts[1] || '';

    // Read blueprint.md for short metadata extraction
    let blueprintFirstLines = '';
    const bpPath = path.join(albumDir, 'blueprint.md');
    if (fs.existsSync(bpPath)) {
        try {
            const bp = fs.readFileSync(bpPath, 'utf8');
            blueprintFirstLines = bp.split('\n').slice(0, 25).join('\n');
        } catch {}
    }

    // Tracks: derive from lyrics/*.md (mirrors track structure even when MP3s aren't on this disk)
    const lyricsDir = path.join(albumDir, 'lyrics');
    const tracks = [];
    if (fs.existsSync(lyricsDir) && fs.statSync(lyricsDir).isDirectory()) {
        const lyricsFiles = fs.readdirSync(lyricsDir).filter(f => f.endsWith('.md'));
        for (const lf of lyricsFiles) {
            // Pattern variants seen in catalog:
            //   "JEIPX7001EN-01 Open the Gates of Rapha.md"
            //   "Jubilee Inspire-01 Open the Gates of Rapha-lyrics.md"
            //   "Gage Darron-8 Seconds to Change Your Mind-lyrics.md"
            const stripped = lf.replace(/\.md$/, '').replace(/-lyrics$/i, '');
            // Try to find a 2-digit track number at start or after a dash
            const m = stripped.match(/^(?:[^\-]+-)?(\d{1,2})\s+(.+)$/);
            let trackNumber = null, trackTitle = stripped;
            if (m) {
                trackNumber = parseInt(m[1], 10);
                trackTitle = m[2].trim();
            }
            // Construct expected MP3 filename (matches "01 Open the Gates of Rapha.mp3" pattern)
            const mp3Filename = trackNumber !== null
                ? `${String(trackNumber).padStart(2, '0')} ${trackTitle}.mp3`
                : `${trackTitle}.mp3`;
            const cdnUrl = 'https://cdn.jubileeverse.com/music/albums/' +
                encodeURIComponent(category) + '/' +
                encodeURIComponent(artistSlug) + '/' +
                encodeURIComponent(folderName) + '/tracks/' +
                encodeURIComponent(mp3Filename);
            tracks.push({
                track_number: trackNumber,
                track_title: trackTitle,
                mp3_filename: mp3Filename,
                cdn_url: cdnUrl,
                lyrics_md_path: `/music/albums/${relPath}/lyrics/${lf}`
            });
        }
        tracks.sort((a, b) => (a.track_number || 99) - (b.track_number || 99));
    }

    // Detect a quality report
    const reportFile = fs.readdirSync(albumDir).find(f => /quality-report.*\.md$/i.test(f));

    return {
        path: relPath,
        folder_name: folderName,
        album_code: albumCode,
        album_title: albumTitle,
        category: category,
        artist_slug: artistSlug,
        track_count: tracks.length,
        tracks,
        has_blueprint: fs.existsSync(bpPath),
        has_quality_report: !!reportFile,
        quality_report_path: reportFile ? `/music/albums/${relPath}/${reportFile}` : null,
        blueprint_preview: blueprintFirstLines
    };
}

function serveRequest(req, res) {
    let pathname = req.url.split('?')[0];

    // /api/album?path=cat/artist/album-folder → returns album metadata + track list
    if (pathname === '/api/album') {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const relPath = params.get('path');
        if (!relPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'missing ?path=' }));
            return;
        }
        const result = readAlbumListing(decodeURIComponent(relPath));
        const status = result.status || 200;
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' });
        res.end(JSON.stringify(result));
        return;
    }

    // URL rewrite: /music/albums/{cat}/{artist}/{album-folder}/  →  /album.html?path=...
    // Triggers when the path is under /music/albums/, ends with /, has no index.html,
    // and points to a directory at least 3 levels deep (cat/artist/album).
    if (pathname.startsWith('/music/albums/') && pathname.endsWith('/')) {
        let rel = pathname.substring('/music/albums/'.length).replace(/\/$/, '');
        try { rel = decodeURIComponent(rel); } catch {}
        if (rel.split('/').filter(Boolean).length >= 3) {
            const albumDirCheck = path.join(PUBLIC_DIR, 'music', 'albums', rel);
            if (albumDirCheck.startsWith(path.join(PUBLIC_DIR, 'music', 'albums')) &&
                fs.existsSync(albumDirCheck) && fs.statSync(albumDirCheck).isDirectory()) {
                const hasIndex = fs.existsSync(path.join(albumDirCheck, 'index.html'));
                if (!hasIndex) {
                    res.writeHead(302, { Location: '/album.html?path=' + encodeURIComponent(rel) });
                    res.end();
                    return;
                }
            }
        }
    }

    // /api/cdn-probe?url=<cdn-url> — HEAD-checks a single CDN URL
    if (pathname === '/api/cdn-probe') {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const url = params.get('url');
        if (!url) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'missing ?url=' }));
            return;
        }
        probeCdn(url).then(result => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' });
            res.end(JSON.stringify({ url, ...result }));
        });
        return;
    }

    // /api/cdn-probe-batch — POST with JSON body { urls: [...] } (also accepts GET with comma-separated ?urls=...)
    if (pathname === '/api/cdn-probe-batch') {
        const handleUrls = async urls => {
            const results = {};
            await Promise.all(urls.map(u => probeCdn(u).then(r => { results[u] = r; })));
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' });
            res.end(JSON.stringify({ results }));
        };
        if (req.method === 'POST') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
                try {
                    const j = JSON.parse(body || '{}');
                    handleUrls(j.urls || []);
                } catch { res.writeHead(400); res.end('bad json'); }
            });
            return;
        }
        const params = new URL(req.url, 'http://localhost').searchParams;
        const urls = (params.get('urls') || '').split(',').filter(Boolean);
        handleUrls(urls);
        return;
    }

    // Build Spec §19 — ratings/comments/awards/nominations stub APIs
    if (pathname.startsWith('/api/ratings') ||
        pathname.startsWith('/api/comments') ||
        pathname.startsWith('/api/awards')) {
        if (handleStubApi(req, res, pathname)) return;
    }

    // Trailing-slash directories resolve to /index.html
    if (pathname.endsWith('/')) pathname += 'index.html';

    // Decode URL-encoded path segments (spaces, apostrophes, etc.) before
    // filesystem lookup — otherwise paths with %20 / %27 will 404 even when
    // the real file has a space or apostrophe in its name.
    let decodedPathname = pathname;
    try { decodedPathname = decodeURIComponent(pathname); } catch {}

    // Resolve against PUBLIC_DIR
    const filePath = path.join(PUBLIC_DIR, decodedPathname);

    // Prevent path traversal outside PUBLIC_DIR
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    // Serve the file if it exists
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
        const cacheCtl = (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.svg' || ext === '.woff' || ext === '.woff2') ? 'public, max-age=86400' : 'no-cache';
        res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': cacheCtl });
        res.end(fs.readFileSync(filePath));
        return;
    }

    // 404 for unknown subpaths
    if (pathname !== '/index.html') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1><p><a href="/">Back to Jubilujah.com</a></p>');
        return;
    }

    // Fallback (only if /public/index.html is somehow missing)
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(COMING_SOON_HTML);
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    serveRequest(req, res);
});

server.listen(PORT, () => {
    console.log('');
    console.log('='.repeat(50));
    console.log(`  ${SITE_NAME} Server`);
    console.log('='.repeat(50));
    console.log(`  Status:  Running`);
    console.log(`  Port:    ${PORT}`);
    console.log(`  URL:     http://localhost:${PORT}`);
    console.log('='.repeat(50));
    console.log('');
});

process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
});
