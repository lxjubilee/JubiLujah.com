# JubiLujah.com — Playlist System Specification

**Deliverable:** Playlist engine, playlist page, and the first production playlist ("Praise Celebration")
**Platform:** JubiLujah.com (self-hosted CMS)
**Audience:** AI developer / implementation engineer

---

## 1. Purpose

Build a playlist system for JubiLujah.com in which every playlist is anchored to a **Playlist Theme**, and the listener controls **which Inspire Family musical artists** appear in the mix — within the boundaries of that theme.

The system is not a genre browser. It is a **theme-and-emotion browser**. The theme defines the spiritual and emotional intent; the artist selector lets the listener shape the sound.

Beyond assembly, the system carries eight enhancement layers (sections 6 through 13) that turn a playlist from a queue of audio into a ministry experience: story, testimony, language, time-fit, mood, arc, voice, and declaration.

---

## 2. Core concepts

### 2.1 Playlist Theme
Every playlist has exactly one Playlist Theme. The theme is a first-class object, not a text label.

A Playlist Theme record contains:

| Field | Type | Notes |
|---|---|---|
| `theme_id` | string | Stable slug, e.g. `praise-celebration` |
| `theme_name` | string | Display name, e.g. "Praise Celebration" |
| `theme_statement` | string | 1–2 sentences of listener-facing intent |
| `emotional_profile` | array | Ordered emotional descriptors (e.g. joy, triumph, gratitude) |
| `energy_range` | int range | 0–100% scale. Defines admissible track energy |
| `tempo_range` | int range | BPM floor and ceiling |
| `eligible_personas` | array | Persona IDs permitted under this theme |
| `excluded_moods` | array | Emotional tones that disqualify a track |
| `target_track_count` | int | Default 120 |
| `available_languages` | array | Language codes with a full eligible pool (section 7) |
| `testimony_categories` | array | Testimony types admissible as interludes (section 8) |
| `supported_arcs` | array | Energy arcs offered for this theme (section 11) |

### 2.2 Track eligibility
A track qualifies for a playlist only if **all** of the following are true:

1. Its energy score falls inside the theme's `energy_range`.
2. Its tempo falls inside the theme's `tempo_range`.
3. Its primary emotional tag intersects the theme's `emotional_profile`.
4. It carries none of the theme's `excluded_moods`.
5. Its performing persona is in the theme's `eligible_personas`.
6. Its language matches the listener's active language selection.
7. It has a valid, reachable CDN audio URL.

Rule 7 is a hard gate. A track without a resolvable CDN location is never served.

### 2.3 The 120-song standard
Each playlist targets **120 tracks**. Because the album standard is exactly 12 songs per album, 120 tracks must be sourced across a **minimum of 30 distinct albums**.

Composition rules:

- **Maximum 4 tracks per album.** No album may dominate a playlist.
- **Minimum 30 distinct albums** represented.
- **No two tracks from the same album may play back to back.**
- **No two tracks from the same persona may play back to back** when three or more personas are active in the listener's selection.
- If the eligible pool cannot fill 120 slots under these constraints, the playlist ships short rather than relaxing the rules — and logs a `pool_underfill` warning naming the theme, the language, and the shortfall.

---

## 3. The Inspire Family artist selector

### 3.1 The 12 musical personas
The listener may select any combination of the 12 Inspire Family musical artists:

1. Jubilee Inspire
2. Melody Inspire
3. Zariah Inspire
4. Elias Inspire
5. Eliana Inspire
6. Caleb Inspire
7. Imani Inspire
8. Zev Inspire
9. Amir Inspire
10. Nova Inspire
11. Santiago Inspire
12. Tahoma Inspire

> **Spelling is locked.** "Eliana Inspire" — never "Ileana." Persona display names are pulled from the persona registry, never hand-typed into templates.

> Gabriel Inspire (apostolic covering) is **not** a selectable musical artist and does not appear in the artist selector.

### 3.2 Theme gating
A persona appears in the selector for a given playlist **only if that persona is listed in the theme's `eligible_personas`.** Personas whose genre anchor or emotional register conflicts with the theme are not offered — they are omitted from the selector entirely rather than shown disabled, so the interface never advertises a choice it will not honor.

### 3.3 Selector behavior

- Default state: **all eligible personas selected.**
- The listener may deselect freely, down to a floor of **one** persona.
- Attempting to deselect the last remaining persona is blocked with an inline message.
- Every change re-shuffles the playlist immediately against the new pool. No page reload.
- The live count of resulting tracks is displayed beside the selector (e.g. "94 tracks").
- If a selection yields fewer than 30 tracks, surface a soft notice inviting the listener to add an artist back — but still play what is available.
- The listener's selection persists to their account per playlist, so returning to "Praise Celebration" restores their chosen artist mix.

### 3.4 Selector UI

- Artist cards showing persona portrait, name, and genre anchor.
- Multi-select via tap or click; selected state is visually unmistakable.
- "Select all" and "Reset to default" controls.
- On mobile, the selector collapses into a bottom sheet triggered by an "Artists" control in the playlist header.

---

## 4. Playlist page layout

Top to bottom:

1. **Hero** — playlist artwork, playlist name, theme statement, track count, total runtime.
2. **Primary controls** — Play, Shuffle, Save, Send (section 14).
3. **Session shapers** — language, session length, energy arc, and mood check-in (sections 7, 10, 11, 9).
4. **Artist selector** — the 12-persona multi-select described in section 3.
5. **Track list** — track title, persona, album, duration, and a Story affordance per track (section 6).
6. **Related playlists** — other playlists sharing overlapping emotional profiles.

The session shapers and artist selector sit **above** the track list, because personalization is the primary act on this page.

---

## 5. First playlist — "Praise Celebration"

### 5.1 Theme record

```json
{
  "theme_id": "praise-celebration",
  "theme_name": "Praise Celebration",
  "theme_statement": "High praise, full voice, hands lifted. Songs of triumph, joy, and thanksgiving for the moments you want to celebrate His goodness out loud.",
  "emotional_profile": [
    "joy",
    "triumph",
    "thanksgiving",
    "exuberance",
    "victory",
    "celebration"
  ],
  "energy_range": { "min": 65, "max": 100 },
  "tempo_range": { "min": 100, "max": 165 },
  "excluded_moods": [
    "lament",
    "mourning",
    "contemplative",
    "somber",
    "repentance",
    "intercession"
  ],
  "target_track_count": 120,
  "max_tracks_per_album": 4,
  "min_distinct_albums": 30,
  "eligible_personas": "ALL_TWELVE",
  "testimony_categories": ["healing", "provision", "breakthrough", "deliverance"],
  "supported_arcs": ["steady", "build", "worship_set"],
  "default_arc": "steady"
}
```

### 5.2 Notes on this theme

- `eligible_personas` is set to all twelve. Praise celebration crosses every genre anchor — a listener should be able to build an all-gospel celebration, an all-Latin celebration, or a full-family mix.
- The energy floor of 65% is deliberate. This playlist should never drop into a reflective valley; a listener using it for a workout or a drive should be able to leave it running without the energy collapsing.
- Excluded moods are enforced strictly. A theologically excellent lament has no place here regardless of quality score.

### 5.3 Sequencing for this playlist
Beyond the global rules in section 2.3:

- Open with a track scoring at or above 85% energy.
- Never place more than two consecutive tracks below 75% energy.
- Distribute the highest-energy tracks across the full run rather than front-loading them, so the playlist stays alive at track 90 the way it was at track 5.

---

## 6. Backstage on every track

Every track exposes a **Story** affordance in the track list and in the now-playing view.

- Tapping it opens the song's Backstage piece — interview, testimony, or story — in an overlay **while the song keeps playing.** Playback is never interrupted.
- The overlay shows the piece's supporting image, the piece body, and a return control.
- If a track has no published Backstage piece, the affordance is not rendered. It is never rendered in a disabled state.
- Backstage content on JubiLujah.com runs in blended theological vocabulary; the playlist system reads the mode from the piece record and does not override it.
- Track a `backstage_open` event per track. Songs whose stories get opened most are the songs to promote.

This is the highest-value differentiator in the specification. The catalog and the narrative around it are owned together, which no external platform can replicate.

---

## 7. Language switching inside the theme

A theme is language-agnostic; the track pool is not.

- The playlist header carries a **language selector** listing only the codes in the theme's `available_languages`.
- Changing language rebuilds the entire 120-track set from that language's pool, holding the theme, the artist selection, and the energy arc constant.
- A language appears in the selector only if its eligible pool can satisfy the full composition rules in section 2.3. Partial pools are hidden, not offered short.
- Default language follows the listener's account setting, falling back to browser locale, falling back to English.
- Language selection persists per account, not per playlist.

One theme authored once becomes a fully native experience in every language the catalog supports.

---

## 8. Testimony interludes

Short recorded testimonies are injected into the playlist as non-music items.

- **Cadence:** one interlude every 8 to 10 tracks, position randomized within that window so the rhythm is not mechanical.
- **Matching:** only testimonies whose category appears in the theme's `testimony_categories` are eligible. A healing testimony belongs in a celebration set; it does not belong in a children's set unless the theme says so.
- **Length:** target 45 to 90 seconds. Anything longer breaks the listening flow.
- **Placement:** never as the first or last item in a session; never adjacent to another interlude.
- **Control:** a single toggle, "Testimony interludes," on by default, remembered per account. Skipping an interlude behaves exactly like skipping a track.
- Interludes do not count toward the 120-track target and do not affect album-spread math.

Source these from the testimony repository. Only actual, historically recorded testimonies are eligible — never composed or dramatized accounts.

---

## 9. Mood check-in

An optional, lightweight entry question that lets the same theme meet the listener where they actually are.

- On opening a playlist, present a single question with four to six tappable responses describing how the listener is arriving today.
- The response biases assembly within the theme's existing boundaries. It never overrides `energy_range` or `excluded_moods` — a weary listener entering Praise Celebration still gets celebration, but weighted toward the gentler, more declarative end of the admissible range.
- The check-in is dismissible with one tap and is never blocking.
- Do not re-ask within the same day. Store the response with a timestamp and expire it at midnight in the listener's local time.
- Mood responses are private to the listener and never surfaced back to them as a label or a diagnosis.

---

## 10. Duration-fit assembly

Let the listener state the time they have, and build to it exactly.

- Offer preset session lengths (for example 20, 35, 60, and 90 minutes) plus a custom entry, alongside a "Full playlist" option that serves all 120.
- The engine assembles a set whose total runtime lands within 60 seconds of the requested duration.
- The energy arc (section 11) is compressed or expanded to fit the window, so a 20-minute build still has a genuine build in it.
- Testimony interludes are counted in the runtime budget when the toggle is on.
- Display the fitted runtime and track count before playback starts.
- The last selected duration persists per playlist.

---

## 11. Selectable energy arcs

The listener chooses the shape of the session, not just its contents. Three arcs:

| Arc | Shape | Use |
|---|---|---|
| `steady` | Holds a consistent energy band throughout | Workouts, driving, background praise |
| `build` | Starts at the lower end of the admissible range and climbs | Preparation, warm-up, getting ready to go |
| `worship_set` | Four movements — gather, rise, crest, land | Personal worship, small group, corporate use |

- Only arcs listed in the theme's `supported_arcs` are offered.
- The arc governs sequencing only. It never changes eligibility — every track served still satisfies section 2.2 in full.
- `worship_set` lands on the softest admissible tracks in the theme. Where a theme's floor is high (as in Praise Celebration), "land" means the least driving celebration tracks, not a mood departure.
- Arc selection persists per playlist.

---

## 12. Persona hosting

Optional in-voice introductions from the performing artists, radio style.

- When enabled, a selected persona speaks a short introduction before certain tracks — their own, or the set as a whole.
- **Frequency:** no more than one hosted introduction every 5 tracks. Restraint is the whole design here.
- **Voice:** generated through the established voice pipeline against the persona's locked voice profile. Never a generic narrator voice.
- **Content rule:** host lines are truthful. The songs are openly AI-created; a host line never claims human authorship, studio anecdotes, or invented personal history.
- **Control:** off by default. A single "Artist intros" toggle, remembered per account.
- When the listener has narrowed to a single persona, that persona hosts exclusively. This is what turns an artist filter into a relationship.

---

## 13. Declaration mode

Lyric-forward playback built for speaking the word aloud, not reading it silently.

- A full-screen view showing lyrics synchronized to playback.
- Lines flagged as **declarations** in the lyrics record are held on screen larger and longer, with the surrounding lyric dimmed, so the listener has time to speak them.
- Where a declaration is drawn from Scripture, the reference is displayed beneath it.
- Screen stays awake while declaration mode is active.
- Works in every supported language, using that language's own lyric record. Never a machine translation at playback time.
- Entered from the now-playing view; exiting returns to the same playback position.

Declaration flags are authored in the lyrics file alongside the lyrics themselves. If a track has no flagged declarations, declaration mode still displays synchronized lyrics without emphasis.

---

## 14. Full-rotation memory and sharing

### 14.1 Full-rotation memory
- Record every track served to a listener per playlist.
- No track repeats until the entire eligible pool has been exhausted for that listener.
- On exhaustion, reset the rotation and log the cycle.
- Rotation history is scoped per playlist and per language, and survives changes to the artist selection — deselecting and reselecting a persona does not reset what that listener has already heard.
- With 120 tracks in rotation, a daily listener goes roughly a month before hearing anything twice. This is the single most effective defense against a playlist going stale.

### 14.2 Send a playlist
- A **Send** control on the playlist header lets a listener hand a themed set to someone else with a short personal note.
- The recipient receives the playlist with its theme, the sender's note, and the sender's artist selection preserved as the starting configuration.
- Sending never transfers audio files. It transfers a reference that resolves inside the ecosystem.
- Recipients without an account can play the shared set; account creation is offered but not required to listen.

---

## 15. Data requirements

Each track record must expose, at minimum:

- `track_id`, `title`, `album_id`, `album_title`, `track_number`
- `persona_id` (performing Inspire Family artist)
- `duration_seconds`
- `tempo_bpm`
- `energy_score` (0–100%)
- `emotional_tags` (array)
- `language_code`
- `cdn_audio_url`
- `backstage_piece_id` (nullable)
- `lyrics_record_id` with declaration flags (nullable)
- `theological_mode` (internal field; not surfaced in the interface)

If tempo, energy, or emotional tags are missing for a track, that track is excluded from theme matching and flagged for enrichment. Do not infer these values at query time.

---

## 16. Services and refresh

- A background **service** rebuilds the eligible-track pool for every theme-and-language pair whenever new tracks are published to the catalog. Nightly at minimum, plus event-triggered on catalog publish.
- A second **service** refreshes the testimony interlude pool per theme on the same cadence.
- Playlist ordering is generated per listener session, not stored globally, so two listeners with identical artist selections do not hear an identical sequence.
- Cache the eligible pool per theme-language-persona combination; cache the *order* nowhere.

---

## 17. Licensing enforcement

Playback of these playlists is free within the Jubilee ecosystem. The player must not expose download, export, or copy paths from the playlist page — including from the Send flow, which transfers references only. Purchase and licensing routes remain on the dedicated download and organizational-license flows.

---

## 18. Acceptance criteria

The build is complete when:

1. A "Praise Celebration" playlist exists with 120 tracks drawn from 30 or more distinct albums, with no album contributing more than 4 tracks.
2. Every track in the playlist satisfies all seven eligibility rules in section 2.2.
3. The artist selector displays exactly the 12 musical personas, defaults to all selected, and cannot be emptied to zero.
4. Deselecting a persona re-shuffles the playlist in place, with the track count updating live.
5. The listener's artist selection, language, duration, and arc all persist across sessions.
6. No track plays back to back with another from the same album.
7. Every served track resolves to a valid CDN audio URL.
8. Tracks with a published Backstage piece expose a Story affordance that opens without interrupting playback.
9. Switching language rebuilds a full 120-track set in that language, holding theme, artists, and arc constant.
10. Testimony interludes appear on the specified cadence, match the theme's categories, and can be toggled off.
11. A requested session length produces a set landing within 60 seconds of the target.
12. Each supported arc produces a measurably different energy sequence from the same pool.
13. No track repeats for a listener until the eligible pool is exhausted.
14. Adding a new theme record creates a fully working playlist page with no code changes — themes are data, not hard-coded pages.

---

## 19. Build order

**Phase 1 — Foundation**
1. Theme record schema and storage.
2. Track metadata audit — confirm tempo, energy, and emotional tags exist across the catalog. Enrich what is missing before anything else.
3. Eligibility query engine.
4. Composition and sequencing engine (the 120-track rules).
5. Playlist page shell.
6. Artist selector with live re-shuffle.
7. Selection persistence.
8. Pool-rebuild background service.
9. Load "Praise Celebration" as the first production theme.

**Phase 2 — Highest-value enhancements**
10. Full-rotation memory (section 14.1). Small build, largest effect on retention.
11. Backstage integration (section 6). The differentiator.
12. Duration-fit assembly (section 10).
13. Energy arcs (section 11).

**Phase 3 — Depth**
14. Language switching (section 7).
15. Testimony interludes (section 8).
16. Declaration mode (section 13).
17. Mood check-in (section 9).
18. Persona hosting (section 12).
19. Send a playlist (section 14.2).

**Phase 4 — Scale**
20. Author the remaining nine themes as data records against the same engine.
