import type { Album } from '@/lib/torahsings/types';
import { PLACEHOLDER_AUDIO } from '@/lib/torahsings/media';

/**
 * Album VI — The Exodus Song.
 *
 * Surfaced from אשירה — the first word of the Song of the Sea, which means
 * "I will sing" — read symbol by symbol, folded by seven, sounded in Aeolian on
 * A. It begins on the tonic and climbs to the fifth. Rising, unresolved.
 */
export const theExodusSong: Album = {
  slug: 'the-exodus-song',
  title: 'The Exodus Song',
  topic: 'Exodus',
  albumNumber: 6,
  oneLiner: 'The first word of the song is a promise to sing it, and the last note has not landed yet.',
  description:
    'Seven songs surfaced from אשירה, the word with which Mosheh and Yisrael open the Song of the Sea on the far shore, sounded in Aeolian on A. Sung from above the water by the watch that stood all night between the camps and saw the wall of the deep hold.',
  presenter: 'Santiago Inspire',
  art: { hue: 322, glyph: 'ש' },
  mode: 'aeolian-a',
  source: {
    reference: 'Exodus 15:1',
    hebrew: 'אשירה',
    transliteration: 'Ashirah',
    english: 'I will sing',
  },
  article: {
    headline: 'The Song That Names Itself',
    voice: 'Santiago Inspire',
    minutes: 7,
    audioUrl: null,
    blocks: [
      {
        type: 'p',
        text: 'The Song of the Sea is the oldest poem in the Scriptures, and it begins with an act of self-description so quiet that most readers walk straight past it. Mosheh and the children of Yisrael stand on the far bank with the water closing behind them, and the first word out of the song is אשירה — ashirah. It is a verb. It is first person. And it is in the aspect Hebrew reserves for what has not been completed. I will sing. Before the song says anything about Yahuah, or the sea, or the horse and the rider, it announces what it is about to become.',
      },
      {
        type: 'p',
        text: 'Consider how unusual this is. A victory hymn ought to open in the past tense. Something has happened; the singers survived it; the natural grammar of survival is recollection. Instead the Song of the Sea opens forward. It does not say we sang. It does not say it is finished. It says I will sing, and it goes on saying it while it is being sung, which means the song is never quite the song yet — it is always the promise of the song, renewing itself line by line for as long as anyone keeps singing.',
      },
      {
        type: 'quote',
        text: 'Who is like unto thee, O Yahuah, among the mighty ones? who is like thee, glorious in holiness, fearful in praises, doing wonders?',
        cite: 'Exodus 15:11',
      },
      {
        type: 'p',
        text: 'And there were other witnesses that night. The text is careful about them. The messenger of Elohim who had gone before the camp of Yisrael removed and went behind them, and the pillar of cloud went from before their face and stood behind. One cloud, and it did two things: it was darkness to the Mitsrim and it gave light by night to Yisrael, and neither camp came near the other all night long. Something stood in the gap. The people crossing the sea on dry ground had a rear guard, and it was not made of men.',
      },
      {
        type: 'p',
        text: 'Now read the word itself. Five symbols, unpointed. The ox standing still. The teeth that consume. The working hand. The head. And the lifted arms of behold, at the end. Fold each value by seven, sound the degrees in Aeolian on A, and the word departs from home and climbs, and the climb does not come back down. The Song of the Sea names itself, and then it leaves itself open. Whoever cut those letters was describing a people who had finished one thing and started nothing yet.',
      },
      {
        type: 'p',
        text: 'We offer this without decree, as we offer everything here — not canon, not doctrine, only something to consider, held up to the light and turned over. But the shape of it is difficult to unsee. The sea is behind them. The wilderness is not the destination. The word for I will sing rises and hangs, unresolved, and forty years of desert are contained in the hanging.',
      },
    ],
  },
  lyrics: {
    note: 'Surfaced from Exodus 14:19–31 and Exodus 15:1–18. Sung above the water, by the watch that stood between the camps all night.',
    stanzas: [
      [
        'The water stood up on either side',
        'and we stood between the water and the water,',
        'and the wind that held it back the whole night through',
        'came out of a mouth none of us has ever seen open.',
      ],
      [
        'We were given the rear guard. That is all we were told.',
        'Move behind them. Be dark to the one and light to the other.',
        'So the same fire that lit the road for the slaves',
        'lay across the chariots like a hand held down.',
      ],
      [
        'They went over on the ground. On the ground.',
        'We are the ones who fly, and we have no word for that —',
        'a nation walking dry through the middle of the sea',
        'with the deep standing at attention on both sides of them.',
      ],
      [
        'And on the far shore the woman took up a timbrel',
        'and the first word out of the man was I will sing.',
        'Not I sang. Not it is finished.',
        'But I will. Future. The song admitting it is not over.',
      ],
      [
        'They think the crossing was the end of it.',
        'It is a fifth. It is not a cadence.',
        'Go on into the wilderness, you singers.',
        'We will hold the note above you until you come home.',
      ],
    ],
  },
  derivation: {
    intro:
      'Every song on this album begins at the first word of the Song of the Sea: אשירה — Ashirah — stripped of pointing and cantillation and read as the five symbols it is. The table below is the disclosed layer of the method. Each letter carries a pictographic sense and a standard numerical value. The value is folded by seven onto a degree of a seven-note mode. Seven degrees. This album sings in Aeolian on A. There is a small delight waiting at the bottom of all this: the source word means, in plain Hebrew, I will sing. The song names itself before it begins.',
    steps: [
      'Strip the pointing. The vowel marks and the cantillation came later; read only the consonantal frame, as it stood when it was cut.',
      'Restore the pictograph. Each symbol carries an older sense — an ox, teeth, a hand, a head, lifted arms — that the letter has never entirely shed.',
      'Take the standard value. The numbers are not fashioned for this method; they are the ones the tradition has assigned since long before anyone listened for a scale in them.',
      'Fold by seven. Each value reduces onto a degree, one through seven. Multiples of seven rest on the seventh; nothing is discarded, nothing goes to zero.',
      'Sound the degree in the mode of the album. Until the mode receives it, a degree has no pitch. Here the mode is Aeolian on A.',
    ],
    closing:
      'The first word of the Song of the Sea is אשירה, and it means I will sing. Before the poem says anything about Yahuah, or the sea, or the horse and the rider, it says what it is about to do — the Song of the Sea names itself. Now read the symbols. The aleph, the ox, the strength standing still, sounds the tonic: A. The shin, the teeth, climbs to the sixth, F. The yod, the working hand, falls to the third, C. The resh, the head, rises to the fourth, D. And the hey — behold, breath, arms lifted — reaches the fifth, E, and there the word stops. A · F · C · D · E. It begins at home and it climbs, and it does not come home again. Rising. Unresolved. The people who first sang it were standing on the far shore of one thing and the near shore of everything else, and the letters know it. They are still crossing.',
    withheld:
      'What is disclosed here is enough to reproduce the note sequence. It is not enough to reproduce the song. The ordering and interleave that turn a degree sequence into melody, the rhythm and octave placement, and the voice-assignment pass that distinguishes the angelic register from the human one remain undisclosed. Serious students will find the methodology, at the disclosed level, in the downloadable resources kit included with membership.',
  },
  tracks: [
    { n: 1, title: 'The Wall of Water Stood', duration: '5:24', audioUrl: PLACEHOLDER_AUDIO, freeTier: true },
    { n: 2, title: 'It Moved Behind Them', duration: '6:47', audioUrl: PLACEHOLDER_AUDIO, freeTier: true },
    { n: 3, title: 'Horse and Rider', duration: '4:31', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 4, title: 'The Watch Between the Camps', duration: '7:39', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 5, title: 'Who Is Like Unto Thee', duration: '3:44', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 6, title: 'Miryam Took the Timbrel', duration: '5:58', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 7, title: 'They Are Still Crossing', duration: '8:12', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
  ],
  freeTier: false,
  releasedAt: '2026-06-18',
};
