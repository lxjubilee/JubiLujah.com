import type { Album } from '@/lib/torahsings/types';
import { PLACEHOLDER_AUDIO } from '@/lib/torahsings/media';

/**
 * Album IV — The Throne Room.
 *
 * Surfaced from כסא, read symbol by symbol, folded by seven, sounded in
 * Phrygian on E. Three symbols, one descent, landing on the tonic. The throne
 * is the resting place.
 */
export const theThroneRoom: Album = {
  slug: 'the-throne-room',
  title: 'The Throne Room',
  topic: 'The Throne Room',
  albumNumber: 4,
  oneLiner: 'Three symbols, one long descent, and a seat that has never once been empty.',
  description:
    'Seven songs surfaced from the word for throne — כסא — as Yeshayahu saw it in the year the king died, high and lifted up, the train of the robe filling the temple. Sung from the floor of that room by the ones who keep their faces covered.',
  presenter: 'Imani Inspire',
  art: { hue: 18, glyph: 'ק' },
  mode: 'phrygian-e',
  source: {
    reference: 'Isaiah 6:1',
    hebrew: 'כסא',
    transliteration: 'Kise',
    english: 'throne',
  },
  article: {
    headline: 'Everything in That Room Is Coming Down',
    voice: 'Imani Inspire',
    minutes: 6,
    audioUrl: null,
    blocks: [
      {
        type: 'p',
        text: 'Yeshayahu dates the vision precisely — in the year that King Uzziah died — and then loses hold of the calendar entirely. The throne he sees is high and lifted up, and the hem of the robe on it does not drape; it fills the temple, the way water fills a jar. There is no measurement in the account and no architecture. A man who has spent his life describing kings walks into the room where the King is and finds that his vocabulary has been confiscated at the door.',
      },
      {
        type: 'p',
        text: 'Above the throne stand the burning ones. Six wings each: two covering the face, two covering the feet, two for flying. Read the arithmetic slowly, because it is not decorative. Two thirds of the equipment of a seraph is spent on not looking and not being seen. Only one pair does what wings are for. These are creatures built for proximity, and they have arranged themselves almost entirely around the problem of surviving it.',
      },
      {
        type: 'quote',
        text: 'And one cried unto another, and said, Holy, holy, holy, is Yahuah of hosts: the whole earth is full of his glory.',
        cite: 'Isaiah 6:3',
      },
      {
        type: 'p',
        text: 'Notice the direction of the singing. One cried unto another. They are not singing to the throne; they are singing across the room, to each other, and the song is antiphonal — a call thrown and a call returned, over and over, while the doorposts shake on their hinges and the house fills with smoke. Kadosh, kadosh, kadosh. Three times, because twice would sound like a comparison and once would sound like a description, and neither of those is what the burning ones mean.',
      },
      {
        type: 'p',
        text: 'The word Yeshayahu uses for the seat is only three symbols. The open palm that covers. The prop that upholds. And the ox — strength, the first, the leader — at the end of the line. Fold each value by seven and sound the degrees in Phrygian on E, and the three of them go down. Not up. The word for throne descends. Whatever we have absorbed about power reaching for altitude, the letters here are doing the opposite, and they finish where the mode finishes, on the ground of it, at rest.',
      },
      {
        type: 'p',
        text: 'We hold this out the way you would hold out something turned up in the sand, wiped clean with a thumb — not as canon, not as decree, but as something to consider. The room is still there. The song across it has not stopped for a single hour since Yeshayahu stumbled into the middle of it and said, correctly, that he was undone.',
      },
    ],
  },
  lyrics: {
    note: 'Surfaced from Isaiah 6:1–8 and Ezekiel 1:26–28. Sung by those who cover their faces and sing anyway.',
    stanzas: [
      [
        'Six wings. Two for the face, because of the light.',
        'Two for the feet, because of the ground.',
        'Two to fly, because this room has no floor',
        'that any of us has ever found.',
      ],
      [
        'We do not sing to Him. We sing to one another.',
        'One of us cries out and another answers,',
        'and the posts of the door move on their hinges,',
        'and the house fills with smoke, and we begin again.',
      ],
      [
        'A man came in once. He was not summoned.',
        'He said, I am undone, and he was right.',
        'One of us took a coal off the altar with tongs —',
        'we cannot hold it either — and touched his mouth with it.',
      ],
      [
        'Everything in this room is coming down.',
        'The train of the robe comes down and fills it.',
        'The glory comes down and the whole earth is full.',
        'The seat is at the bottom, and the seat is not empty.',
      ],
      [
        'Kadosh. Kadosh. Kadosh.',
        'Three times, because twice would be a comparison',
        'and once would be a description,',
        'and neither of those is anything like what we mean.',
      ],
    ],
  },
  derivation: {
    intro:
      'Every song on this album begins at the word Yeshayahu reaches for when he tries to say what he saw: כסא — kise, the throne — stripped of pointing and cantillation and read as the three symbols it is. The table below is the disclosed layer of the method. Each letter carries a pictographic sense and a standard numerical value. The value is folded by seven onto a degree of a seven-note mode. Seven degrees. This album sings in Phrygian on E, the mode with the half step at the door.',
    steps: [
      'Strip the pointing. The vowel marks and cantillation are later hands; read only the consonantal frame, cut as a scribe cut it.',
      'Restore the pictograph. Behind the letter stands the picture it came from — an open palm, a prop, an ox — and the picture still carries its sense.',
      'Take the standard value. The numbers are inherited, not assigned for this purpose; the tradition set them down long before anyone listened for a scale inside them.',
      'Fold by seven. Each value reduces onto a degree, one through seven. Multiples of seven rest on the seventh; no symbol falls away to nothing.',
      'Sound the degree in the mode of the album. A degree stays a number until a mode lends it a pitch. Here the mode is Phrygian on E.',
    ],
    closing:
      'כסא is only three symbols, and all three are doing the same thing. The kaf is the open palm — to cover, to bend, to allow — and it sounds the sixth, C, high in the mode and unsteady there. The samech is the prop, the thing that upholds and turns, and it falls to the fourth, A. And the aleph — ox, strength, the first — lands on E, the tonic, the ground of the mode. C · A · E. A descent, and not a climb. Every symbol in the word for throne is coming down, and what it comes down to is rest. The letters total eighty-one, nine upon nine. The throne is not the place where power strains upward. It is the place where power sits.',
    withheld:
      'What is disclosed here is enough to reproduce the note sequence. It is not enough to reproduce the song. The ordering and interleave that turn a degree sequence into melody, the rhythm and octave placement, and the voice-assignment pass that distinguishes the angelic register from the human one remain undisclosed. Serious students will find the methodology, at the disclosed level, in the downloadable resources kit included with membership.',
  },
  tracks: [
    { n: 1, title: 'In the Year the King Died', duration: '5:41', audioUrl: PLACEHOLDER_AUDIO, freeTier: true },
    { n: 2, title: 'Six Wings', duration: '4:26', audioUrl: PLACEHOLDER_AUDIO, freeTier: true },
    { n: 3, title: 'Two to Cover the Face', duration: '6:09', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 4, title: 'One Cried Unto Another', duration: '3:47', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 5, title: 'The Train of the Robe', duration: '7:55', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 6, title: 'A Coal Off the Altar', duration: '5:18', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
    { n: 7, title: 'The Seat That Is Never Empty', duration: '8:24', audioUrl: PLACEHOLDER_AUDIO, freeTier: false },
  ],
  freeTier: false,
  releasedAt: '2026-04-23',
};
