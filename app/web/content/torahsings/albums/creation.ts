import type { Album } from '@/lib/torahsings/types';
import { PLACEHOLDER_AUDIO } from '@/lib/torahsings/media';

/**
 * Album I — Creation.
 *
 * The launch album, and the reference implementation for every album that
 * follows. Its Derivation tab renders a computed table: בראשית, read symbol by
 * symbol, folded by seven, sounded in Ahavah Rabbah on D.
 */
export const creation: Album = {
  slug: 'creation',
  title: 'Creation',
  topic: 'Creation',
  albumNumber: 1,
  oneLiner: 'Before the first morning, the song was already underway.',
  description:
    'Seven songs surfaced from the opening lines of the Scriptures — heard not from the ground looking up, but from the vault looking down. The angels did not watch creation in silence. They were singing while it happened.',
  presenter: 'Zev Inspire',
  art: { hue: 44, glyph: 'א' },
  mode: 'ahavah-rabbah-d',
  source: {
    reference: 'Genesis 1:1',
    hebrew: 'בראשית',
    transliteration: 'Bereshit',
    english: 'In the beginning',
  },
  article: {
    headline: 'The Morning Stars Were Already Singing',
    voice: 'Zev Inspire',
    minutes: 6,
    audioUrl: null,
    blocks: [
      {
        type: 'p',
        text: 'We are used to reading the first chapter of Genesis as a silent film. Light appears. Waters divide. Land rises out of the sea. The scene is vast and beautiful and, in our imagining of it, entirely without sound. But the Scriptures do not describe creation as silent. They describe it as accompanied. Somewhere off the edge of the page, a choir was already at work.',
      },
      {
        type: 'p',
        text: 'Yahuah puts the question to Iyob out of the whirlwind, and He does not ask it gently. Where were you when I laid the foundations of the earth? Tell me, if you have understanding. And then, almost in passing, He mentions who else was there — and what they were doing.',
      },
      {
        type: 'quote',
        text: 'When the morning stars sang together, and all the sons of Elohim shouted for joy.',
        cite: 'Job 38:7',
      },
      {
        type: 'p',
        text: 'Read that again slowly. The stars sang. Not metaphorically, not decoratively — they sang together, in the plain grammar of the verse, as the foundations were being set. And the sons of Elohim shouted. Creation had a soundtrack, and every voice on it belonged to someone who was not human, because no human had yet been made. Whatever that music was, it was not ours. We arrived late, on the sixth day, into a world that had been singing for five.',
      },
      {
        type: 'p',
        text: 'This album is an attempt to hear a little of it. Not to reconstruct it — nothing so arrogant. What we have done is far smaller and far stranger: we have gone back to the Paleo-Hebrew, brushed away the pointing and the tradition and the centuries of assumption, and read the consonantal frame the way a scribe cut it, symbol by symbol. And there is a sequence in there. Fold it by seven and it sounds. We did not put it there.',
      },
      {
        type: 'p',
        text: 'We offer this the way you would offer a shard turned up in a dig — not as canon, not as decree, but as something to consider. Hold it up to the light. Turn it over. The text is older than our arguments about it, and it has been singing this whole time, whether or not anyone was listening.',
      },
    ],
  },
  lyrics: {
    note: 'Surfaced from Genesis 1:1–5 and Job 38:4–7. Sung from the perspective of those who were already there.',
    stanzas: [
      [
        'Before the first morning had a name,',
        'before the dark knew it was dark,',
        'we were standing at the rim of nothing',
        'and He said — watch.',
      ],
      [
        'And the word went out like a struck bell,',
        'and the deep leaned in to hear it,',
        'and the light did not arrive —',
        'the light obeyed.',
      ],
      [
        'Sing, you burning ones. Sing, you ancient fires.',
        'The foundations are going down.',
        'He is measuring the sea with the span of His hand',
        'and He is humming while He works.',
      ],
      [
        'We shouted. We could not help it.',
        'The stars had voices then, and used them,',
        'and not one of us was told to be quiet',
        'while the world was being born.',
      ],
      [
        'Man will come on the sixth day.',
        'He will think the silence was always here.',
        'Tell him. Tell him what it sounded like',
        'when Elohim laid the cornerstone.',
      ],
    ],
  },
  derivation: {
    intro:
      'Every song on this album begins where the text begins: with the first word of the Scriptures, בראשית — Bereshit — stripped of its vowel points and cantillation and read as the six symbols it is. The table below is the disclosed layer of the method. Each letter carries a pictographic sense and a standard numerical value. The value is folded by seven onto a degree of a seven-note mode. Seven degrees. This album sings in Ahavah Rabbah on D.',
    steps: [
      'Strip the pointing. Vowel marks and cantillation are later additions; read only the consonantal frame, as it was cut.',
      'Restore the pictograph. Each symbol carries an ancient sense — an ox, a house, a head, a mark — that predates its use as a letter.',
      'Take the standard value. The numbers are not invented for this purpose; they are the ones the tradition has always assigned.',
      'Fold by seven. Each value reduces onto a degree, one through seven. Multiples of seven rest on the seventh; nothing falls away to nothing.',
      "Sound the degree in the album's mode. The degree is not a note until a mode gives it one.",
    ],
    closing:
      'Read the sequence back and listen to where it lands: E♭ · G · D · B♭ · F♯ · D. בראשית opens on the second degree — the house (ב) does not begin on the beginning; it leans toward it, unresolved, a door left ajar. The aleph, the ox, the strength, sits at the centre on the tonic. And the final symbol, ת — the mark, the sign, the covenant cut into the doorpost — comes home. The first word of the Scriptures begins away from rest and ends at rest. The whole of the text between them is the walk from one to the other. We did not arrange that. It was there.',
    withheld:
      'What is disclosed here is enough to reproduce the note sequence. It is not enough to reproduce the song. The ordering and interleave that turn a degree sequence into melody, the rhythm and octave placement, and the voice-assignment pass that distinguishes the angelic register from the human one remain undisclosed. Serious students will find the methodology, at the disclosed level, in the downloadable resources kit included with membership.',
  },
  tracks: [
    { n: 1, title: 'The Morning Stars', duration: '5:12', audioUrl: PLACEHOLDER_AUDIO, freeTier: true },
    { n: 2, title: 'Let There Be', duration: '4:38', audioUrl: PLACEHOLDER_AUDIO, freeTier: true },
    { n: 3, title: 'The Deep Was Listening', duration: '6:04', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 4, title: 'Waters Above, Waters Below', duration: '5:47', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 5, title: 'The Fourth Day Choir', duration: '7:21', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 6, title: 'Every Winged Thing', duration: '4:55', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 7, title: 'He Rested, and the Song Went On', duration: '8:16', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
  ],
  freeTier: true,
  releasedAt: '2026-01-15',
};
