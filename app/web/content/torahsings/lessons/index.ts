import type { LessonAlbum } from '@/lib/torahsings/types';

/**
 * Prong III — Learn Hebrew.
 *
 * Three courses, six lessons each, taught by Zev and Zariah Inspire. The
 * arc is deliberate: first the letters as pictures, then the roots that grow
 * out of them, then the consonantal frame itself — ending with the sevenfold
 * fold, taught plainly enough that a student can open any album's Derivation
 * tab and follow every line of it.
 *
 * Every letter name, pictographic sense, and numerical value here is taken
 * from ALEPH_BET in `lib/derivation.ts`. That table is the source of truth;
 * nothing in this file may contradict it.
 */
export const lessonAlbums: LessonAlbum[] = [
  {
    slug: 'the-aleph-bet-alive',
    title: 'The Aleph-Bet, Alive',
    subtitle: '22 letters',
    level: 1,
    presenters: ['Zev Inspire'],
    glyph: 'א',
    hue: 44,
    intro:
      'Twenty-two symbols, and before any of them made a sound, each one was a picture — an ox, a house, a foot, a door. Learn the pictures and the sounds follow, because that is the order in which they were made. You do not need fluency here; you need only the willingness to look at a letter and see the thing it once drew.',
    lessons: [
      {
        n: 1,
        title: 'Ox, House, Foot, Door',
        summary:
          'The first four symbols — א ב ג ד — as the pictures they were before they were letters. An ox head, a tent, a foot, a doorway.',
        durationMinutes: 9,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'Before א was a letter, it was a picture. What did the picture show?',
            choices: [
              'A tent peg driven into the ground',
              'A raised hand',
              'An ox head — strength, the first, the leader',
              'A closed door',
            ],
            answerIndex: 2,
            note: 'Aleph is the ox: strength, the first, the leader. It carries the value 1, and it stands at the head of the twenty-two — not because it is loudest, but because it is first.',
          },
          {
            prompt:
              'The Hebrew word אב (av) means “father.” Read its two symbols as pictures, in order. What do you see?',
            choices: ['House, then ox', 'Door, then house', 'Ox, then foot', 'Ox, then house'],
            answerIndex: 3,
            note: 'Strength, then dwelling — the strength of the house. The pictures are not a dictionary and they do not govern the grammar. But they are rarely silent, and this is something to consider.',
          },
          {
            prompt: 'ד is the door. What number does the tradition assign it?',
            choices: ['3', '4', '5', '10'],
            answerIndex: 1,
            note: 'Dalet is 4. The first nine letters simply count: Aleph 1, Bet 2, Gimel 3, Dalet 4. Gimel, the foot, is 3 — a picture of gathering, of lifting up, of walking.',
          },
        ],
      },
      {
        n: 2,
        title: 'Behold, Nail, Mattock, Wall',
        summary:
          'ה ו ז ח. A figure with arms lifted, a peg, a harvesting blade, a boundary of stone. Four pictures, and one of them is doing a quiet job in nearly every verse.',
        durationMinutes: 10,
        mediaUrl: null,
        exercises: [
          {
            prompt:
              'ו — Vav — is drawn as a nail or a peg. Beyond fastening, what everyday job does this letter do in Hebrew?',
            choices: [
              'It marks a question',
              'It joins words together — it is the word “and”',
              'It doubles the letter before it',
              'It closes a sentence',
            ],
            answerIndex: 1,
            note: 'Vav fastens, joins, and means “and.” Its value is 6. Every time the Scriptures say “and,” a nail is being driven between two things to hold them together.',
          },
          {
            prompt: 'ח, Chet, pictures a wall. Which sense follows from the picture?',
            choices: [
              'To separate, to enclose, to protect',
              'To pour out, to flood',
              'To lift up, to walk',
              'To speak, to open',
            ],
            answerIndex: 0,
            note: 'Chet is 8. A wall does two things at once: it shuts out, and it shelters. The other three answers belong to מ (water), ג (foot), and פ (mouth).',
          },
          {
            prompt:
              'ה is often rendered “behold” — a figure standing with arms lifted. What is its number?',
            choices: ['5', '6', '7', '8'],
            answerIndex: 0,
            note: 'Hey is 5, and it carries breath and revelation with it. The four in this lesson run straight on: Hey 5, Vav 6, Zayin 7, Chet 8. Zayin is the mattock — to cut, to harvest, a weapon.',
          },
        ],
      },
      {
        n: 3,
        title: 'Basket, Hand, Palm, Staff',
        summary:
          'ט י כ ל. At the tenth letter the counting turns over, and the alphabet begins to climb by tens.',
        durationMinutes: 11,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'י — Yod — is the smallest letter on the page. What does its picture show?',
            choices: [
              'A seed dropped into a furrow',
              'An eye',
              'A flame',
              'A hand — work, deed, that which is made',
            ],
            answerIndex: 3,
            note: 'Yod is the hand: work, deed, that which is made. It is the smallest mark in the alphabet and it carries the value 10. The seed is נ, the eye is ע.',
          },
          {
            prompt: 'Something changes at י. What is it?',
            choices: [
              'The letters stop carrying pictures',
              'The counting turns over: א–ט run 1 through 9, and י begins the tens',
              'The letters begin to be written right to left',
              'The letters can no longer begin a word',
            ],
            answerIndex: 1,
            note: 'Tet closes the units at 9. Yod opens the tens at 10, and from there the alphabet climbs — Kaf 20, Lamed 30 — all the way to Tsade at 90.',
          },
          {
            prompt: 'ל, Lamed, is the shepherd’s staff. Which sense does it carry?',
            choices: [
              'To surround, to contain',
              'To cut, to harvest',
              'To teach, to lead, authority',
              'To cover, to bend',
            ],
            answerIndex: 2,
            note: 'Lamed is 30 — to teach, to lead, authority. It is also the only letter that rises above the line of the others, a staff held up over the flock. The distractors belong to ט, ז, and כ.',
          },
        ],
      },
      {
        n: 4,
        title: 'Water, Seed, Prop, Eye',
        summary:
          'מ נ ס ע. The deep, the heir, the post that holds a thing upright, and the eye that takes it all in.',
        durationMinutes: 11,
        mediaUrl: null,
        exercises: [
          {
            prompt:
              'The pictograph behind מ is water. Which cluster of meanings does the letter carry?',
            choices: [
              'The deep, chaos, the mighty',
              'The doorway and the threshold',
              'The head and the highest',
              'The mark and the sign',
            ],
            answerIndex: 0,
            note: 'Mem is water — the deep, chaos, the mighty — and its value is 40. The three wrong answers belong to ד, ר, and ת, and each of them will matter later.',
          },
          {
            prompt: 'נ, Nun, is the seed. What number sits beneath it?',
            choices: ['40', '50', '60', '70'],
            answerIndex: 1,
            note: 'Nun is 50: life, continuation, the heir. These four climb evenly — Mem 40, Nun 50, Samech 60, Ayin 70.',
          },
          {
            prompt:
              'One of these letters is a prop that holds a thing upright. The other three are not. Which is Samech?',
            choices: [
              'ע — to see, to know, to experience',
              'צ — to catch, to desire',
              'ס — to support, to uphold, to turn',
              'ט — to surround, to contain',
            ],
            answerIndex: 2,
            note: 'Samech is the prop, value 60. Ayin, the eye, is 70 — in Hebrew a consonant you can barely hear, and a picture of seeing, knowing, and having experienced a thing for yourself.',
          },
        ],
      },
      {
        n: 5,
        title: 'Mouth, Hook, Sun, Head',
        summary:
          'פ צ ק ר. A mouth opens, a hook catches, the sun rests on the horizon, and a head lifts. Here the alphabet leaves the tens behind and climbs by hundreds.',
        durationMinutes: 12,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'פ — Pey — pictures the mouth. Which sense belongs to it?',
            choices: [
              'To catch, to desire',
              'To consume, to press',
              'To fasten, to join',
              'To speak, to open, the word',
            ],
            answerIndex: 3,
            note: 'Pey is the mouth: to speak, to open, the word. Its value is 80. Its neighbor צ, the hook, is the one that catches and desires — and the tradition hangs the righteous one on that letter.',
          },
          {
            prompt:
              'ק — Qof — is drawn as the sun at the horizon. Which cluster of meanings does that image carry?',
            choices: [
              'The first, the highest',
              'Behind, the last, a circle',
              'The deep, the mighty',
              'A sign, a covenant',
            ],
            answerIndex: 1,
            note: 'Qof is 100 — the sun going down behind, the last light, and the circle it draws through the year. The first and the highest is ר, the head.',
          },
          {
            prompt:
              'ר, Resh, is the head. Reading straight through the alphabet, its value is the largest you have met so far. What is it?',
            choices: ['90', '100', '200', '300'],
            answerIndex: 2,
            note: 'Resh is 200. Only four letters carry the hundreds: Qof 100, Resh 200, Shin 300, Tav 400. Ninety belongs to צ, the hook.',
          },
        ],
      },
      {
        n: 6,
        title: 'Teeth, Mark, and the Five That Change Shape',
        summary:
          'ש and ת close the twenty-two. Then the five letters that take a different form when they come to the end of a word — and what happens to them when you count.',
        durationMinutes: 13,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'ש, Shin, pictures teeth. What sense is carried with it?',
            choices: [
              'To gather, to lift up',
              'To see, to know',
              'To consume, to press, the sharp',
              'To surround, to contain',
            ],
            answerIndex: 2,
            note: 'Shin is 300 — teeth: to consume, to press, the sharp. It is the letter that grinds a thing down to what it actually is.',
          },
          {
            prompt: 'ת closes the aleph-bet. What is its picture, and what is its number?',
            choices: [
              'A tooth — and 300',
              'A mark — a sign, a covenant — and 400',
              'A head — and 200',
              'A hook — and 90',
            ],
            answerIndex: 1,
            note: 'Tav is the mark: a sign, a covenant, the cross. Value 400, the last and the largest. The alphabet begins with strength and ends with a covenant cut into wood.',
          },
          {
            prompt: 'Five Hebrew letters take a different shape at the end of a word. Which five?',
            choices: [
              'א, ב, ג, ד, ה',
              'ג, ד, ט, ס, ע',
              'כ, מ, נ, פ, צ',
              'ל, מ, נ, ס, ע',
            ],
            answerIndex: 2,
            note: 'They become ך, ם, ן, ף, ץ — the sofit, or final, forms. They are the same letters wearing an end-of-word coat, and in this method they fold back onto the base letter and keep its value.',
          },
        ],
      },
    ],
    freeTier: true,
    releasedAt: '2026-01-15',
  },
  {
    slug: 'first-words-and-roots',
    title: 'First Words & Roots',
    subtitle: 'your first 40 words',
    level: 2,
    presenters: ['Zariah Inspire'],
    glyph: 'ב',
    hue: 208,
    intro:
      'Hebrew words grow the way trees do — out of a root of three letters, buried under the page. Learn to see the root and a hundred words stop being strangers: כ־ת־ב is writing, and every word for scribe, script, and Scripture leans on it. You do not need fluency — only forty words and the habit of looking underneath them.',
    lessons: [
      {
        n: 1,
        title: 'Three Letters Hold a World',
        summary:
          'What a root is, why the vowels are not written, and how one skeleton of three consonants can carry a whole family of words.',
        durationMinutes: 10,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'Most Hebrew words are built on a root. How many letters does a typical root have?',
            choices: ['Two', 'Three', 'Four', 'One, with prefixes doing the rest'],
            answerIndex: 1,
            note: 'Three consonants — a skeleton. Vowels, prefixes, and suffixes are hung on it afterward, and the skeleton keeps its meaning through every one of them.',
          },
          {
            prompt: 'In an unpointed Hebrew text, what is actually written on the line?',
            choices: [
              'Consonants only — the reader carries the vowels',
              'Consonants and vowels, exactly as spoken',
              'Vowels only',
              'Whole syllables, each with its own symbol',
            ],
            answerIndex: 0,
            note: 'The pointing beneath the letters was added centuries later by scribes preserving a reading tradition. The consonantal frame is the older thing, and it is what the derivation reads.',
          },
          {
            prompt: 'The root ב־ר־א means “create.” Which word is built directly on it?',
            choices: [
              'barukh — “blessed”',
              'bara — “he created,” the second word of the Scriptures',
              'berit — “covenant”',
              'bayit — “house”',
            ],
            answerIndex: 1,
            note: 'Genesis opens: bereshit bara Elohim. Barukh grows from ב־ר־ך instead — one letter apart on the page, and a world apart in meaning. Watch the third letter.',
          },
        ],
      },
      {
        n: 2,
        title: 'כ־ת־ב — Writing, and Everything Written',
        summary:
          'One root, followed out to its branches: katav, ktav, katuv, mikhtav, Ketuvim. Watch a family assemble itself out of three letters.',
        durationMinutes: 11,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'The root כ־ת־ב carries the idea of writing. Which of these is built on it?',
            choices: [
              'כהן (kohen) — “priest”',
              'כבד (kaved) — “heavy”',
              'כתב (katav) — “he wrote”',
              'כפר (kafar) — “to cover, to atone”',
            ],
            answerIndex: 2,
            note: 'From כ־ת־ב: katav, “he wrote”; ktav, “script”; katuv, “it is written”; mikhtav, “a letter.” The other three are real words on real roots — none of them this one.',
          },
          {
            prompt:
              'Ketuvim — the “Writings,” the third division of the Hebrew Scriptures — grows from which root?',
            choices: ['ק־ד־ש', 'כ־ת־ב', 'ק־ר־א', 'ד־ב־ר'],
            answerIndex: 1,
            note: 'Torah, Nevi’im, Ketuvim. The third division is simply “the things written.” When you know the root, the name of a whole section of Scripture explains itself.',
          },
          {
            prompt:
              'Now read כ־ת־ב as pictures rather than sounds. What three images stand there, in order?',
            choices: [
              'House, mark, open palm',
              'Hand, teeth, house',
              'Open palm, teeth, mark',
              'Open palm, mark, house',
            ],
            answerIndex: 3,
            note: 'A palm makes a mark; the mark is kept in the house. Offer that as something to consider, not as a rule — the pictures do not govern the grammar, but they are seldom idle.',
          },
        ],
      },
      {
        n: 3,
        title: 'ש־מ־ע — To Hear Is to Heed',
        summary:
          'A root that refuses to separate listening from obeying — and a neighbor one letter away that means something else entirely.',
        durationMinutes: 12,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'The Hebrew verb שמע (shama) covers two English ideas at once. Which pair?',
            choices: [
              'To see and to know',
              'To speak and to command',
              'To read and to write',
              'To hear and to obey',
            ],
            answerIndex: 3,
            note: 'Shema Yisrael — “Hear, O Israel.” In Hebrew there is no clean seam between hearing a thing and heeding it. To have heard and not done is, in this language, not quite to have heard.',
          },
          {
            prompt: 'Change one letter: ש־מ־ע becomes ש־מ־ר. What does the new root mean?',
            choices: ['To keep, to guard, to watch', 'To send', 'To rest', 'To bless'],
            answerIndex: 0,
            note: 'Shamar. The man was set in the garden to work it and to keep it — that verb. One letter turns hearing into guarding. In an unpointed text, the third letter is where you look.',
          },
          {
            prompt:
              'The name Shimon (Simeon) is given in Genesis with its reason attached. Which root stands under it?',
            choices: [
              'ש־מ־ר — to keep',
              'ש־ל־ם — to be whole',
              'ש־מ־ע — to hear',
              'ש־מ־ן — oil, fatness',
            ],
            answerIndex: 2,
            note: 'Leah names him because Yahuah heard. The same root names Yishmael — “El hears.” Hebrew names are frequently sentences, and the sentence is usually about Elohim.',
          },
        ],
      },
      {
        n: 4,
        title: 'ב־ר־ך and ק־ד־ש — The Knee and the Set-Apart',
        summary:
          'Two roots the Scriptures lean on constantly. One of them hides a body part inside a blessing; the other means far less than “nice” and far more than “pure.”',
        durationMinutes: 12,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'The root ב־ר־ך gives both a verb and a body part. Which body part?',
            choices: ['The knee', 'The hand', 'The mouth', 'The heart'],
            answerIndex: 0,
            note: 'Berekh is the knee; barakh is to bless; barukh is blessed. To bless and to kneel share a skeleton of three letters. Something to consider, the next time you read the word.',
          },
          {
            prompt: 'ק־ד־ש is usually rendered “holy.” What does the root actually describe?',
            choices: [
              'Being morally pure',
              'Being ancient',
              'Being set apart, cut off for one purpose',
              'Being hidden from sight',
            ],
            answerIndex: 2,
            note: 'Qodesh is separation before it is sentiment. A miqdash is the set-apart place; a vessel is qadosh because it is reserved, not because it is well behaved.',
          },
          {
            prompt: 'Which of these is NOT built on ק־ד־ש?',
            choices: [
              'qadosh — set apart',
              'miqdash — sanctuary',
              'qodesh — holiness',
              'qadim — the east wind',
            ],
            answerIndex: 3,
            note: 'Qadim comes from ק־ד־ם — east, front, that which is ancient. One letter apart from holiness. Read the third letter before you decide what a word means.',
          },
        ],
      },
      {
        n: 5,
        title: 'א־מ־ן — Firmness, Faith, and Amen',
        summary:
          'The root behind a word you have said all your life. It does not mean “I agree.” It means something closer to “let it hold.”',
        durationMinutes: 13,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'When you say “amen,” what are you saying in Hebrew?',
            choices: [
              '“Please”',
              '“Truly — let it stand firm”',
              '“Thank you”',
              '“The end”',
            ],
            answerIndex: 1,
            note: 'א־מ־ן is to confirm, to be firm, to support. Amen is not punctuation at the close of a prayer. It is you putting your weight on what was just said.',
          },
          {
            prompt: 'Which of these grows from the same root as “amen”?',
            choices: [
              'ahavah — love',
              'shalom — peace',
              'emunah — faithfulness',
              'chesed — steadfast love',
            ],
            answerIndex: 2,
            note: 'Emunah is less “belief” than “reliability” — the firmness of a thing that holds when you lean on it. The righteous, says Habakkuk, will live by his emunah. The others are א־ה־ב, ש־ל־ם, and ח־ס־ד.',
          },
          {
            prompt: 'Genesis 15:6 says Abram he’emin in Yahuah. What is that verb doing?',
            choices: [
              'It is a noun meaning “altar”',
              'It is a form of ה־ל־ך, to walk',
              'It is an imperative — “believe”',
              'It is א־מ־ן in the causative stem — he held firm, he trusted',
            ],
            answerIndex: 3,
            note: 'The causative stem takes the root’s firmness and turns it inward: he leaned, and it held. The same three letters end every prayer you have ever said amen to.',
          },
        ],
      },
      {
        n: 6,
        title: 'Forty Words You Already Know',
        summary:
          'Shalom, melekh, Shabbat, zakhar, shamar, avodah, davar, Yeshua. A closing sweep through the vocabulary — and three traps that catch careful readers.',
        durationMinutes: 14,
        mediaUrl: null,
        exercises: [
          {
            prompt:
              'מלך (melekh) is “king.” מלאך (mal’akh) is “messenger” — the word behind “angel.” What separates them?',
            choices: [
              'Nothing — they are the same word',
              'Only the vowels',
              'The final letter',
              'A silent א, and two different roots',
            ],
            answerIndex: 3,
            note: 'Melekh stands on מ־ל־ך. Mal’akh carries an א and grows from ל־א־ך, to send, with a mem in front. A king and a messenger: one letter apart on the page, and nothing alike underneath.',
          },
          {
            prompt: 'Shabbat (שבת) and sheva (שבע), “seven,” look like cousins. Are they the same root?',
            choices: [
              'Yes — one and the same root',
              'Yes, and Shabbat simply means “seventh”',
              'No — Shabbat ends in ת, sheva in ע; the roots differ',
              'No — sheva is borrowed from Aramaic',
            ],
            answerIndex: 2,
            note: 'ש־ב־ת is to cease, to rest. ש־ב־ע is the number seven. They meet on the seventh day and nowhere in the dictionary — which is worth sitting with, and worth not overstating.',
          },
          {
            prompt: 'The name Yeshua is built on which root?',
            choices: [
              'י־ש־ע — to save, to deliver',
              'י־ש־ב — to sit, to dwell',
              'י־ד־ע — to know',
              'י־צ־א — to go out',
            ],
            answerIndex: 0,
            note: 'Yeshuah, “salvation,” comes from the same three letters. The name is not decorative. It is the root, spoken as a person.',
          },
        ],
      },
    ],
    freeTier: false,
    releasedAt: '2026-03-05',
  },
  {
    slug: 'reading-the-paleo-layer',
    title: 'Reading the Paleo Layer',
    subtitle: 'symbols behind the sounds',
    level: 3,
    presenters: ['Zev Inspire', 'Zariah Inspire'],
    glyph: 'ש',
    hue: 276,
    intro:
      'The pointing beneath the letters came later. Underneath it lies the consonantal frame — the text as a scribe cut it, each symbol a picture and a number at once. You still do not need fluency, only patience and a slow eye; and by the last lesson you will know the sevenfold fold itself, well enough to open any album’s Derivation tab and follow every line of it.',
    lessons: [
      {
        n: 1,
        title: 'Beneath the Pointing',
        summary:
          'Vowel points and cantillation marks are a later layer, laid over an older one. Learning to see through them is the whole first step.',
        durationMinutes: 11,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'The vowel points beneath Hebrew letters — the niqqud — are what, exactly?',
            choices: [
              'A later notation, added by scribes to preserve a reading tradition',
              'Part of the letters from the beginning',
              'Musical notation only',
              'A modern invention for students',
            ],
            answerIndex: 0,
            note: 'The consonantal frame is the older thing by many centuries. Reading beneath the pointing is not disrespect toward it. It is standing where the scribe stood.',
          },
          {
            prompt: 'What do the cantillation marks — the te’amim — do?',
            choices: [
              'They mark plural nouns',
              'They indicate loanwords',
              'They number the verses',
              'They set the chant and phrase the verse',
            ],
            answerIndex: 3,
            note: 'The text has been sung for a very long time. The te’amim carry the chant, and they also tell you where a clause bends. What we read here lies beneath them.',
          },
          {
            prompt: 'To read the Paleo layer of בראשית, what do you strip away first?',
            choices: [
              'The first letter',
              'The final letter',
              'The spaces between words',
              'The pointing and the cantillation, leaving six consonants',
            ],
            answerIndex: 3,
            note: 'What remains is ב ר א ש י ת. Six symbols, in reading order, each one a picture and a number. Nothing has been added. Something has been taken away.',
          },
        ],
      },
      {
        n: 2,
        title: 'The Hand Before the Square Script',
        summary:
          'The letters printed in a Hebrew Bible today are not the letters an Israelite scribe cut into stone. The shapes changed. The names did not.',
        durationMinutes: 12,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'The square letters printed in a Hebrew Bible today came into use when?',
            choices: [
              'At Sinai',
              'After the Babylonian exile, adopted from Aramaic script',
              'In the Middle Ages',
              'With the printing press',
            ],
            answerIndex: 1,
            note: 'The older Israelite hand — what we call Paleo-Hebrew — is what you find cut into the Siloam tunnel wall and inked onto the Lachish letters. Same language, different clothes.',
          },
          {
            prompt: 'Why does a letter’s pictographic sense still matter once the shape has changed?',
            choices: [
              'The name traveled with the letter — Aleph still means “ox,” whatever the shape',
              'It does not matter; the shapes are all that count',
              'Because the square script is a picture too',
              'Because the sounds changed along with the shapes',
            ],
            answerIndex: 0,
            note: 'The letter was named for the thing it drew, and the name outlived the drawing. Bet is still a house. Mem is still water. That is why the table in the Derivation tab can be trusted across three thousand years of handwriting.',
          },
          {
            prompt: 'Which of these is a Paleo-Hebrew inscription?',
            choices: [
              'The Rosetta Stone',
              'The Behistun inscription',
              'The Cyrus Cylinder',
              'The Siloam tunnel inscription',
            ],
            answerIndex: 3,
            note: 'Cut into the rock of the water tunnel beneath Jerusalem, in the old letters, by the men who dug it. The other three are Egyptian, Old Persian, and Akkadian — none of them Hebrew.',
          },
        ],
      },
      {
        n: 3,
        title: 'Right to Left, First to Last',
        summary:
          'Reading direction, the four letters that moonlight as vowels, and what happens to a final form when you count it.',
        durationMinutes: 12,
        mediaUrl: null,
        exercises: [
          {
            prompt:
              'Hebrew is read right to left. When we list the letters of a word “in order,” which one comes first?',
            choices: [
              'The leftmost letter',
              'The rightmost letter — it is the word’s head',
              'The tallest letter',
              'Whichever carries the vowel',
            ],
            answerIndex: 1,
            note: 'In בראשית the ב stands at the right and is read first. Throughout these lessons the letters are named in reading order — first letter first — however your screen happens to draw them.',
          },
          {
            prompt:
              'Four letters can do double duty as “mothers of reading,” standing in for vowels. Which four?',
            choices: ['ב ג ד כ', 'ה ח ע ת', 'א ה ו י', 'כ מ נ פ'],
            answerIndex: 2,
            note: 'Matres lectionis. In בראשית the י is doing exactly this work, and the א has gone silent. A letter can be a sound, a number, and a picture at once — and sometimes a breath besides.',
          },
          {
            prompt: 'A word ends with ם instead of מ. What happens when its value is counted?',
            choices: [
              'It counts as 600',
              'It counts as zero',
              'It doubles, to 80',
              'It folds back onto מ and counts as 40',
            ],
            answerIndex: 3,
            note: 'In this method a final form is only a shape — ם is מ wearing its end-of-word coat, and it carries the same value. Later counting traditions assign the finals values of their own; the Torah Sings derivation does not.',
          },
        ],
      },
      {
        n: 4,
        title: 'The Letter Is Named for Its Picture',
        summary:
          'Yod is a hand, and yad is the word for hand. Peh is a mouth, and peh is the letter. Once you notice this, you cannot stop noticing it.',
        durationMinutes: 13,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'The Hebrew word for “hand” is יד (yad). What is remarkable about its first letter?',
            choices: [
              'י — Yod — is itself the pictograph of a hand',
              'It is the largest letter',
              'It is never used anywhere else',
              'It has no numerical value',
            ],
            answerIndex: 0,
            note: 'Yod is the hand — work, deed, that which is made — and its value is 10. The letters are named for the things they drew: shen, a tooth, for ש; peh, a mouth, for פ; ayin, an eye, for ע.',
          },
          {
            prompt: 'אב (av) means “father.” Read it as pictures and you get:',
            choices: [
              'House, then ox',
              'Ox, then house — strength, then dwelling',
              'Door, then house',
              'Hand, then house',
            ],
            answerIndex: 1,
            note: 'The strength of the house. Hold that as something to consider rather than a conclusion. The pictographs are not a dictionary — but a father is, in the plainest sense, the strength of a house.',
          },
          {
            prompt: 'In which pair is the letter actually named for the word?',
            choices: [
              'ספר (sefer) — book, for the letter ס',
              'טוב (tov) — good, for the letter ט',
              'חיים (chayim) — life, for the letter ח',
              'פה (peh) — mouth, for the letter פ',
            ],
            answerIndex: 3,
            note: 'Pey is the mouth. Samech is a prop, not a book; Tet is a basket, not goodness; Chet is a wall, not life. Fine words, all three — but not the names of those letters.',
          },
        ],
      },
      {
        n: 5,
        title: 'בראשית — Six Symbols, Read Slowly',
        summary:
          'The first word of the Scriptures, taken apart symbol by symbol: house, head, ox, teeth, hand, mark. Six pictures, six numbers, and a shape that does not look accidental.',
        durationMinutes: 15,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'בראשית has six symbols. What are their values, in reading order?',
            choices: [
              '2, 20, 1, 30, 10, 40',
              '2, 200, 1, 300, 10, 400',
              '1, 2, 3, 4, 5, 6',
              '400, 10, 300, 1, 200, 2',
            ],
            answerIndex: 1,
            note: 'ב house, ר head, א ox, ש teeth, י hand, ת mark — 2, 200, 1, 300, 10, 400. They sum to 913, the word’s own number. The last answer is the word read backwards, which is how it will look if you forget which way Hebrew runs.',
          },
          {
            prompt:
              'Fold each value by seven — the remainder is the degree, and multiples of seven rest on the seventh. What degrees does בראשית give?',
            choices: ['2, 4, 1, 6, 3, 1', '2, 3, 1, 5, 3, 1', '1, 4, 2, 6, 3, 2', '2, 4, 1, 6, 3, 7'],
            answerIndex: 0,
            note: '200 leaves 4 after seven goes into it twenty-eight times; 300 leaves 6; 400 leaves 1. The word opens on the second degree and closes on the first. It begins away from rest and it ends at rest.',
          },
          {
            prompt:
              'Sounded in Ahavah Rabbah on D — D, E♭, F♯, G, A, B♭, C — what is the note line of בראשית?',
            choices: [
              'D · E♭ · F♯ · G · A · B♭',
              'G · E♭ · D · F♯ · B♭ · D',
              'D · G · E♭ · B♭ · F♯ · D',
              'E♭ · G · D · B♭ · F♯ · D',
            ],
            answerIndex: 3,
            note: 'The aleph — the ox, the strength — lands on D, the tonic, at the center of the word. The tav lands on D again, and the word comes home. Open the Derivation tab on Creation and watch the table compute itself line by line.',
          },
        ],
      },
      {
        n: 6,
        title: 'The Sevenfold Fold',
        summary:
          'The reduction itself, taught plainly: how a letter’s value becomes a degree, why nothing ever falls to nothing, and exactly where the disclosure stops.',
        durationMinutes: 16,
        mediaUrl: null,
        exercises: [
          {
            prompt: 'Fold ל — Lamed, value 30 — by seven. Which degree does it rest on?',
            choices: ['2', '3', '4', '7'],
            answerIndex: 0,
            note: 'Thirty is four sevens and a remainder of two. The remainder is the degree. The shepherd’s staff sounds on the second.',
          },
          {
            prompt:
              'ז — Zayin — carries the value 7, and seven folded by seven leaves a remainder of nothing. Where does it land?',
            choices: [
              'On the first degree',
              'On the seventh degree — nothing falls away to nothing',
              'It is skipped',
              'On no degree; it stays silent',
            ],
            answerIndex: 1,
            note: 'Multiples of seven rest on the seventh. Of the twenty-two letters only two are multiples of seven: ז, the mattock, and ע, the eye. Both come to rest in the same place.',
          },
          {
            prompt:
              'The method discloses the letter table, the sevenfold fold, and the mode. What does it withhold?',
            choices: [
              'The ordering and interleave that turn degrees into melody, together with rhythm, octave placement, and voice assignment',
              'The numerical values of the letters',
              'Which mode an album sings in',
              'The Hebrew source text of an album',
            ],
            answerIndex: 0,
            note: 'What you have learned here is enough to reproduce the note sequence. It is not enough to reproduce the song. That distance is deliberate, and it is stated plainly on every Derivation tab.',
          },
        ],
      },
    ],
    freeTier: false,
    releasedAt: '2026-05-07',
  },
];
