# Jubilee Music Playlist Standard and Editing Specification

**Scope:** Cross-site standard for how playlists are organized, presented, edited, and stored across the Jubilee music sites (currently JubileePraise.com and TorahSings.com). This is the shared default. Individual sites may layer their own exceptions on top of it.

**Relationship to other specs:** This document governs playlist presentation, editing, and storage. It complements the deeper JubileePraise playlist system specification, which covers the internal mechanics of a playlist (song capacity, artist selection across the Inspire Family, and the enhancement layers). Where a figure here differs from that one, see Section 10 (Open Decisions).

---

## 1. Purpose

Give every Jubilee music site one consistent, predictable way to group playlists, lay out a playlist row, let a user edit the songs inside a playlist, and store both the shipped defaults and each user's personalized versions. Consistency lets a visitor who learns the pattern on one site carry it to the next without relearning anything.

---

## 2. Playlist Types

There are three playlist types.

**Thematic** playlists are built around a subject the songs share, the truth the songs are about. A thematic playlist teaches something. (Default, shipped with the site.)

**Emotional State** playlists are built around the state the listener is in, how they want to feel or where they find themselves right now. An emotional state playlist meets the listener where they are. (Default, shipped with the site.)

**My Playlists** are the user's own personalized playlists: playlists they created from scratch or cloned from a default and then edited. (Per-user, stored in the database.)

The first two are the default types that ship on disk. The third holds anything a signed-in user makes their own.

### Ordering on the PLAYLISTS page

For a signed-in user who has personal playlists, "My Playlists" appears first, since their own content is most relevant to them. The default types then follow in this order:

1. My Playlists (signed-in users with personal playlists only).
2. Thematic. Leading the defaults with subject keeps a positive tone and opens with truth.
3. Emotional State.

For a visitor who is not signed in, the page opens with the Thematic section. (Section order is adjustable; see Section 10.)

### Examples

Thematic playlists name the subject: "The Blood of Yeshua," "The Names of Yahuah," "Songs of the Kingdom," "Songs from Genesis" (TorahSings), "The Feasts of Yahuah" (TorahSings).

Emotional State playlists name the feeling or season: "In the Waiting" (seasons that feel stuck), "Broken but Held" (grief that still holds onto hope), "Overflowing with Joy" (already high and wanting to ride it), "When You're Afraid" (anxiety and worry).

---

## 3. Section Headings (Public Wording)

The internal type names ("Thematic," "Emotional State," "My Playlists") are for design and development reference. Two of the three are shown to visitors under warmer, more user friendly headings.

* Thematic section heading: **"Songs by Theme"** (working choice). Alternates: "Rooted in Truth," "Songs of the Faith."
* Emotional State section heading: **"For Your Season"** (working choice). Alternates: "However You're Feeling," "Wherever You Are Today."
* My Playlists section heading: **"My Playlists"** (already user friendly, shown as is).

The two default headings are the current working choice; final wording is still yours to confirm (Section 10).

---

## 4. Playlist Listing Row (Browse View)

Each playlist is presented as a single horizontal row. The row is deliberately short, simple, and to the point.

### Elements, left to right

1. Thumbnail image (the playlist artwork).
2. Title.
3. One-line description.
4. Play button.

### Interaction

* Tapping the row body (thumbnail, title, or description area) opens the playlist.
* The play button on the right performs instant play, without first opening the playlist.

Two intents are served without adding clutter: "let me look at this" and "just start it."

### Description line

The description holds to a single line and truncates past the edge of the row. The recommended style is a short mood or subject line that sells the feeling and pulls the listener in ("Songs of redemption and the cross"), rather than a utilitarian data tag. Invitation over information. This applies to both default sections.

### Edit Playlist link

The description line ends with an "Edit Playlist" link. Selecting it opens the Edit Playlist page (Section 5) with that specific playlist loaded in edit mode.

---

## 5. Edit Playlist Page

### 5.1 Entry

Reached only through the "Edit Playlist" link on a playlist row. It opens the chosen playlist in edit mode, showing every song currently selected for that playlist.

### 5.2 Banner and header

The page opens with the playlist's image displayed as a full-width banner at the top, in the same treatment used for an article page banner. The banner image is the 16:9 image described in Section 6.4. If the playlist has no image yet (its Linked Image field is blank), the banner falls back to a neutral placeholder until an image is generated.

Directly beneath the banner, the header carries a back control, the page title ("Edit Playlist"), a subtitle showing the playlist name and its current song count, and a Save action.

### 5.3 Song list

The body is the ordered list of songs in the playlist. The default number of songs for a single playlist is 36. (See Section 10 regarding the 36 default relative to the previously specified 120 for curated theme playlists.)

### 5.4 The song slot

Each song is presented as its own slot containing the following.

**Two dependent dropdowns:**

1. **Album.** The user selects the music album.
2. **Track.** The user selects a track. The track dropdown offers only the tracks available on the album chosen in the Album dropdown; changing the album repopulates the track list for that album.

**Displayed metadata:** the song title, with the artist's name shown in italics next to the title (for example, *Eliana Inspire*), and a per-song description on its own line.

**Slot controls:** a slot index number, and a remove control that deletes the slot from the playlist.

### 5.5 Adding songs

An "Add song" action at the bottom appends a new, empty slot for the user to fill using the Album and Track dropdowns. See also quick-add by search (Section 7, item 7).

### 5.6 Reordering

Optional. Drag-to-rearrange of the running order is a candidate addition, pending confirmation (Section 10).

### 5.7 Saving

Save persists the edited playlist. For a default playlist, the user's edits are written to the database as their personalized version (Section 6), never to the on-disk default. Post-save navigation is pending confirmation (Section 10).

---

## 6. Data Model and Storage

### 6.1 Default playlists live on disk as JSON

Every default playlist is stored as its own `.json` file inside the site's `/playlists` folder. One file equals one playlist. These on-disk files are the canonical defaults shipped with the site, covering the Thematic and Emotional State types.

### 6.2 Folder structure

Per site, on the J: drive:

* Playlist JSON files: `J:\<sitedomain>\playlists\`
* Generated images: `J:\<sitedomain>\playlists\images\`

Concrete example for TorahSings.com:

* `J:\TorahSings.com\playlists\`
* `J:\TorahSings.com\playlists\images\`

This J: drive location is where the default playlists (and their images) are initially stored.

### 6.3 Playlist JSON schema

Each playlist file carries its identity, its browse-row copy, its image fields, its enhancement data, and its full song list. Fields:

* `id`: kebab-case identifier, matches the file name.
* `title`: display title.
* `type`: one of `Thematic` or `Emotional State` for on-disk defaults.
* `description`: the single-line browse-row description.
* `anchorVerse`: optional Scripture anchor (see Section 7, item 2), with `reference` and short `text`.
* `imagePrompt`: the image generation prompt (see Section 6.4).
* `imageAspectRatio`: `16:9`.
* `linkedImage`: the Linked Image field (see Section 6.4). Blank until an image exists.
* `journey`: guided-journey data (see Section 7, item 4), including `isJourney`, `days`, and `nextPlaylistId` (see Section 7, item 6).
* `surfacing`: time-of-day and Hebraic-calendar tags (see Section 7, item 5).
* `songCount`: default 36.
* `songs`: array of slots, each with `slot`, `album`, `track`, `artist`, and `description`.

Example (song array abbreviated for readability; the real array holds all 36 slots):

```json
{
  "id": "praise-celebration",
  "title": "Praise Celebration",
  "type": "Thematic",
  "description": "High-energy praise across every artist.",
  "anchorVerse": {
    "reference": "Psalm 150:6",
    "text": "Let everything that has breath praise Yah."
  },
  "imagePrompt": "A vibrant, photorealistic wide banner of a joyful, diverse crowd of worshippers of all ages, hands raised, warm celebratory light, confetti in the air, genuine smiles, real energy and movement, cinematic 16:9 composition, no text.",
  "imageAspectRatio": "16:9",
  "linkedImage": "",
  "journey": {
    "isJourney": false,
    "days": null,
    "nextPlaylistId": "the-blood-of-yeshua"
  },
  "surfacing": {
    "timeOfDay": ["morning"],
    "calendar": ["shabbat"]
  },
  "songCount": 36,
  "songs": [
    {
      "slot": 1,
      "album": "Sound of Heaven",
      "track": "Praise Him Now",
      "artist": "Eliana Inspire",
      "description": "An all-out call to lift His name right now."
    },
    {
      "slot": 2,
      "album": "Higher Ground",
      "track": "All My Days",
      "artist": "Eliana Inspire",
      "description": "A steady vow to praise through every season."
    }
  ]
}
```

### 6.4 Playlist image

Every playlist carries an image prompt written so the resulting image is fun, exciting, and people based, meaning it centers real, joyful people rather than abstract or empty scenery. The image is generated in 16:9 format and is used as the top banner on the Edit Playlist page, in the same treatment as an article page banner.

The **Linked Image** field (`linkedImage`) governs display:

* When no image has been generated yet, the Linked Image field is blank, and the banner uses a neutral placeholder.
* Once the image generation service produces the image, the Linked Image field is populated with the generated image's file name (for example, `praise-celebration.png`), which resolves under `\playlists\images\`.

Users can regenerate a playlist's image on demand (Section 7, item 3).

### 6.5 User data lives in PostgreSQL

A signed-in user's changes never touch the on-disk defaults. The site's PostgreSQL database tracks two things:

1. **User edits to default playlists.** When a user edits a Thematic or Emotional State default, their changes are stored as a per-user overlay against that default. The Edit Playlist page then shows the default with that user's overrides applied. The on-disk default remains untouched for everyone else.
2. **User's own playlists.** Playlists the user creates from scratch, or clones from a default and edits, are stored in the database and tracked under the **My Playlists** type.

### 6.6 PLAYLISTS page composition

The page assembles the three sections from these sources:

* **My Playlists**: from the database, for the signed-in user only.
* **Thematic** and **Emotional State**: from the on-disk JSON defaults, with the signed-in user's overrides applied where they exist.

---

## 7. Feature Enhancements

The following ten enhancements are part of this specification.

1. **Seed, do not start blank.** A user can clone any default playlist into an editable personal copy, or auto-fill all 36 slots by theme or feeling in one action, then edit from there. Cloning writes a new My Playlists entry to the database. This removes the one place the Edit page could otherwise feel like a chore.

2. **Scripture-anchored playlists.** Every thematic playlist may carry an anchor verse (`anchorVerse`), shown on the browse row and on the Edit Playlist banner and header. Users can also build a playlist straight from a passage (for example, songs for Psalm 91). This roots each playlist rather than leaving it arbitrary.

3. **Auto-generated cover art.** The site's image generation service renders each playlist's 16:9 image from its `imagePrompt`, and users can regenerate on demand. On success, the Linked Image field is populated with the image file name. A wall of striking, theme-matched covers makes the PLAYLISTS page feel alive.

4. **Guided journeys.** Playlists can be chained into a multi-day path (for example, "7 Days in the Waiting") with simple progress tracking, carried by the `journey` fields. This turns a one-time listen into something people return to finish.

5. **Sabbath- and feast-aware surfacing.** The PLAYLISTS page can raise the right playlists by time of day and by the Hebraic calendar (a Shabbat set on Shabbat, feast playlists during the feasts), driven by the `surfacing` fields. This is especially strong on TorahSings.

6. **Continue the journey.** When a playlist ends, the next playlist that deepens the theme or advances the emotional arc is suggested (for example, "In the Waiting" toward "Broken but Held" toward "Overflowing with Joy"), carried by `nextPlaylistId`. The listener is gently guided onward rather than dropped into silence.

7. **Quick-add by search on the Edit page.** Alongside the album-then-track dropdowns, a search field lets a user type a song or artist name and drop it straight into a slot. The dropdowns remain for browsing; search makes editing a long list fast for anyone who already knows what they want.

8. **Collaborative playlists.** A worship team, a small group, or a Shepherd can co-build and share a single playlist for their people. Collaborative playlists are database-backed My Playlists entries with shared access. This turns a personal feature into a congregational one.

9. **Shareable moment cards.** A verse-plus-art-plus-play-link card can be generated from any song or playlist for social, carrying the site's short links and QR codes through the Redirector engine. This is the piece that reaches new listeners from a single share.

10. **Cross-app soundtrack hooks.** Any playlist can become a morning alarm or the backdrop for the Jubilee app's prayer and declaration cadence, so playlists live beyond the website and into a person's daily rhythm.

---

## 8. Behavior Rules and Constraints

* The Track dropdown always reflects the currently selected album. When the album changes, the track selection resets to that album's list (default to the first available track, or an unselected state; to be finalized in build).
* A slot is considered valid only once a track is selected.
* Two distinct kinds of description exist and must not be conflated: the playlist-level description on the browse row (Section 4), and the song-level description inside each slot on the edit page (Section 5.4).
* On-disk default playlists are never mutated by user activity; all user changes live in PostgreSQL (Section 6.5).
* When a playlist has no image, the Linked Image field stays blank and the banner uses a placeholder; the field is only ever populated with a real generated file name (Section 6.4).
* Public section headings never expose the internal type names (Section 3).

---

## 9. Terminology

* **Playlist:** a named, ordered collection of songs presented as a browse row and editable on the Edit Playlist page.
* **Thematic / Emotional State / My Playlists:** the three playlist types (Section 2).
* **Slot:** one editable song position on the Edit Playlist page, holding the Album and Track dropdowns plus the displayed title, artist, and description.
* **Linked Image field:** the JSON field holding a generated image's file name, blank until an image exists (Section 6.4).

---

## 10. Open Decisions

The following are agreed to be unresolved and are called out so they can be settled before or during build.

1. **Default playlist length.** The stated default here is 36 songs. The JubileePraise theme-playlist system was previously specified at 120 songs per playlist. To confirm: is 36 the default everywhere, or 36 for a user's editable playlist while 120 remains for the large curated theme playlists?
2. **Section headings.** Final public wording for the Thematic and Emotional State headings (working choices: "Songs by Theme" and "For Your Season").
3. **Section order.** Whether "My Playlists" leads for signed-in users, or the defaults always lead.
4. **Description-line style.** Confirm the mood or subject line as the standard over a factual data tag.
5. **Reordering.** Whether drag-to-rearrange is included on the Edit Playlist page.
6. **Save navigation.** Where the user lands after saving.
7. **Image aspect ratio.** ~~Confirm 19:6 is intended.~~ **Resolved 2026-08-06: 16:9** (widescreen banner) — applied throughout this spec (§5.2, §6.3, §6.4, §7.3).

---

## 11. Notes

Artist, album, and track names used as examples in this document (for instance, *Eliana Inspire*, and the album and track titles) are placeholders for illustration and do not fix any catalog content.
