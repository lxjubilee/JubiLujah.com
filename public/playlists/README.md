# /playlists — playlist JSON schema

Each `*.json` in this folder is a curated playlist tied to one of the three site categories.

## Schema

```json
{
  "id": "kebab-case-slug",            // matches filename, used as ?id= param
  "title": "Display Title",
  "category": "inspire|children|general",
  "category_label": "Inspire Family",
  "description": "Short one-paragraph blurb",
  "theme": "Topic anchor (e.g. love, mercy, celebration, healing, lullaby, heritage)",
  "created": "YYYY-MM-DD",
  "cover_gradient_class": "cat-inspire|cat-children|cat-general",
  "albums": [
    {
      "artist_name": "Tahoma Inspire",
      "artist_slug": "tahoma-inspire",
      "album_title": "The Maker's Breath",
      "album_code": "THIM1022",
      "album_slug": "THIM1022EN-the-maker-s-breath",
      "category_path": "inspire/tahoma-inspire",
      "why_included": "Native American flute meditation on the Creator who became flesh in Jesus."
    }
  ]
}
```

The playlist viewer (`/playlist.html?id=<slug>`) fetches `/playlists/<id>.json`, renders the album list, and (for each album) lazily fetches `/music/albums/<category_path>/<album_slug>/album.meta.json` to populate the HTML5 audio player with track CDN URLs.

## Categories

- **inspire** — pulls from the 12-persona Inspire Family
- **children** — pulls from Party Giggles + My Tiny Tiggles
- **general** — pulls from the 7 partner artists (Allan Hassan, Cornell Kay, Daisy Wylder, Gage Darron, Ruthie Bolton, Judah Boone, Mary Beth Mercy)

## Adding a playlist

1. Drop a new `<slug>.json` into this folder
2. Reference it from `/playlists.html` (add a card)
3. Done — viewer auto-loads on `?id=<slug>`
