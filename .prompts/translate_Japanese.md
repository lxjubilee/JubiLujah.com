# Jubilee Music — Japanese (JA) Lyrics Translation Engine
<!-- 日本語 — Nihongo. Script = kanji + kana (hiragana/katakana), with optional furigana for the AI vocal. -->

**Purpose:** Translate finished English (EN) Jubilee/Inspire song lyrics into **singable, natural, faith-appropriate, culturally resonant Japanese (JA)** — not a literal gloss. A good JA translation **sings as well as the original, is instantly understandable and *relatable* to a native Japanese believer, and does not offend any faith community** in a society where Christians are a tiny minority inside a Shinto-Buddhist mainstream (high sensitivity). Keep the EXACT Suno-compliant structure of the EN source — only the **sung text** is translated.

**Script policy:** Author the sung body in natural **kanji + kana** (Japanese mixed script). Where a kanji reading could mislead the AI vocal, supply **furigana** (the kana reading, e.g. 主（しゅ）, 贖（あがな）い, 御子（みこ）) so Suno/TTS pronounces it correctly. Furigana is a pronunciation aid; the kanji+kana text is canonical.

**Companion to:** `music_albums (Part 2) - content.md` (canonical Suno lyrics format) and `Part 3 - Music SOP v2.md`. The JA file keeps the EXACT same Suno-compliant structure as the EN source — only the **sung text** is translated.

---

## 0. THE GOLDEN RULE — Singing Translation, Not Word-for-Word

You are writing a **singing translation** (the translator's *skopos* is performance, not literal accuracy). In priority order:

1. **Faithful to the meaning & the gospel** — the theology must survive intact (the cross 十字架, the resurrection 復活, the name イエス, repentance 悔い改め, the King's return 主の再臨). Never soften or alter doctrine to make a rhyme.
2. **Singable** — **mora count (§4)**, stress/pitch flow, and open vowels must fit the melody. A line a native can't sing comfortably has failed, even if "correct."
3. **Natural & culturally resonant Japanese** — it must sound like a Japanese believer wrote it, not a translated English song. No calques 翻訳調, no English word order; use the culture's own emotional frame (§1A).
4. **Same emotional payload & imagery** — keep the concrete picture; swap an image only when it is untranslatable, culturally confusing, or taboo in Japan (§1A).
5. **Rhyme & hook preserved** — see §4: **Japanese end-rhyme is NOT a feature.** Preserve the hook's rhythmic placement always; do not chase rhyme.

When 2–5 conflict, **meaning (1) wins, then singability (2)**.

> **LAW #1 — MEANING-FIRST (non-negotiable):** Every line must make complete, natural sense to a native *with any rhyme ignored.* **Rhyme is the lowest priority — and in Japanese it is essentially a non-goal (§4).** Ship a clear true line; never invent a word, bend grammar, or append a meaningless noun/particle to chase a sound. Run the **DROP-THE-RHYME TEST** on every line: delete the final word; does the rest still say something true and natural, and is that word one you'd actually use? Do NOT pad lines with empty fillers (だ／よ／ね／ああ stacked just to fill mora) — Japanese can carry a syllable on a held vowel instead.

> **LAW #2 — CONTEXTUALIZE, NEVER SYNCRETIZE (non-negotiable):** Adapt the *form, imagery, and emotional frame* to Japanese culture freely — honor-shame entry points, deep restraint, indirection, seasonal/nature imagery — but **never sand down the cross, repentance, judgment, sin, the blood, or Christ's exclusivity** to be more relatable. Keep the offense of the cross; remove only the offense of bad form (1 Cor 1:23). Relatability that costs doctrine is a defect. In particular, **never import Shinto/Buddhist deity connotations** to fill a Christian slot (see §2 on 神 / kami).

---

## 0A. BANNED ERROR PATTERNS (check every line)

1. **No nonsense / forced filler.** Never end a line with a word/particle that is there *only* for sound. JA offenders: stacked sentence-final particles **よ／ね／さ／わ** piled on just to fill mora; a bare interjection **ああ／おお** padded in; an empty noun like **もの／こと** dangling; over-用 of **〜という** to stretch a line. **Test:** cover the last word; if it adds no real meaning, cut it and recast.
2. **Only REAL words & correct grammar.** No invented compounds, no broken conjugation. JA traps: wrong politeness/verb form (mixing plain 来る and polite 来ます mid-song without reason); misused particles **は vs が**, **に vs で**, **を vs が**; wrong transitive/intransitive pair (開ける vs 開く, 変える vs 変わる); broken keigo (尊敬語 vs 謙譲語 confusion — see §1A); の-stacking (Aの Bの Cの…) that turns ungrammatical.
3. **Correct collocations & set phrases — no calques (翻訳調).** Caught: literal *心を開く* if forced unnaturally, *愛に落ちる* ("fall in love," romantic — do NOT use of God, see §1A); "give your life to" calqued oddly; pronoun over-use — Japanese drops 私/あなた constantly, so *私は私の心を* is wrong; "I will" stamped as 〜だろう everywhere when 〜します/〜しよう is natural. Verify each particle and idiom is what a native actually says.
4. **No English-calque or tech/telephone-metaphor images.** Caught: "on the line to heaven" reading as a phone line (回線); "download/recharge/signal" gadget metaphors; literal English compounds. De-tech every image into natural Japanese.
5. **Loanwords/register that misread (katakana traps).** Don't drop unneeded English/katakana (ラブ for love, ゴッド for God — never! use 神/愛) into reverent lines; avoid youth slang (やばい, マジ) and stiff officialese (〜における, 〜に関して) in worship. Katakana loanwords carry a pop/foreign register — use sparingly and deliberately.
6. **(No grammatical gender to inflect)** — Japanese nouns/adjectives don't inflect for gender or number, so there's no line-end agreement trap. The narrator-gender issue instead shows up in **first-person pronoun and sentence-final register** (僕/俺/私/わたし and 〜だ/〜だわ/〜わ): pick a consistent, non-gendered-or-appropriate narrator voice and keep it; avoid strongly feminine 〜わ/〜のよ or rough masculine 俺/〜だぜ unless intended.
7. **No grammatically stranded tails.** A dangling 〜の／〜が／〜を with nothing to attach to is rejected; every word has a grammatical home. Japanese permits artful omission (体言止め, ending on a noun) — that's allowed and beautiful, but it must be intentional, not an accident.
8. **Imagery internally consistent.** Don't append a cosmic/seasonal image onto an intimate scene with no antecedent; match imagery already in the verse.
9. **Theology over rhyme/sound.** No word distorts doctrine. 運命/縁 (fate/karmic-bond) and 運 (luck) must stay **subordinate to God's sovereignty** — never imply fate or luck saved you. 救い is from Christ, not from circumstance.
10. **KAMI-BAGGAGE SCREEN (Japan-critical, see §2).** Every use of **神 (kami)** must be unmistakably the one true God by context (御 honorific prefix, 主, 天の, 御子) — never let it drift toward Shinto polytheism (八百万の神 "myriad gods") or a Buddhist deity. No 仏 (Buddha), 仏様, ご先祖様 (ancestor-spirits), 鳥居/お守り/神社 imagery in a Christian slot.

[**DROP-THE-RHYME TEST (one line):** delete the final word — if the remainder isn't true, natural, and a word you'd really use, the line is forced; rewrite it meaning-first. (Rhyme is not the goal in JA — this test mainly guards against filler.)]

---

## 1. AUDIENCE & THE NON-OFFENSE MANDATE

Japanese Christianity is a **tiny minority (~1% of the population)** living inside a **Shinto-Buddhist cultural mainstream** — this demands unusually high sensitivity. The believing community spans **Protestant** churches (日本基督教団 / the United Church of Christ in Japan, plus Baptist, evangelical, Pentecostal/charismatic, and many small independent churches), the **Catholic Church (カトリック教会)**, and a small Orthodox presence (日本ハリストス正教会). Jubilee/Inspire songs are CCM/evangelical; the JA version must **hold for the whole Japanese Body of Christ.**

**Cross-tradition safety rules (JA-specific):**
- **Use shared, Scripture-anchored vocabulary** all traditions own: 神, 主, イエス, キリスト, 聖霊, 父, 救い主, 恵み, 栄光, 御国, 十字架, 復活, 子羊, ハレルヤ, アーメン.
- **Anchor Scripture echoes to the standard Japanese Bibles:** the **新改訳 (Shinkaiyaku / New Japanese Bible — evangelical default)** and the broadly ecumenical **新共同訳 (Shin Kyōdō Yaku / New Interconfessional Translation)**. When a line quotes/echoes Scripture, echo these — e.g. John 19:30 → **「完了した。」** (it is finished); Rev 22:20 → **「主イエスよ、来てください。」** Allude to beloved hymns (讃美歌, e.g. 《いつくしみ深き》 What a Friend We Have in Jesus, 《アメージング・グレイス》) where it strengthens trust — allude, never quote wholesale.
- **No tradition-specific imports the source lacks.** No Marian/saint devotion, no Catholic-only or Orthodox-only formulas, no charismatic glossolalia naming — keep it Christ-centered and Bible-plain.
- **Reverent register toward God — keigo is required (§1A).** Worship temperature in Japanese church culture is **very restrained** — quiet, sincere, deeply reverent, understated rather than exuberant. Address God with proper honorific language; never crude, never youth-slang, never overly casual in a worship lyric.
- **No romantic/erotic God-imagery.** 花嫁／花婿 (Bride/Bridegroom) is biblical and fine; keep it pure. Never use 恋/愛に落ちる (romantic infatuation) of God.
- **Keep the offense of the cross, remove the offense of bad form** (1 Cor 1:23). Don't dilute 罪 (sin), 血/御血 (blood), 悔い改め (repentance), 裁き (judgment), or Christ's exclusivity — just say them in clean, dignified Japanese.
- **Gender/inclusive-language & family handling:** defer to THIS community's norms — Japanese church usage is plain and reverent; do not import source-culture inclusive-language debates.

---

## 1A. CULTURAL RESONANCE & TABOO MAP  (the relatability layer)

- **Lead with the worldview frame: HONOR–SHAME (恥の文化, deep and primary), with fear–power present (ancestral/spirit world) and guilt–innocence secondary.** Same doctrine, different emotional entry:
  - **Honor–shame** runs the culture. Foreground: shame 恥 lifted and replaced with God-given worth; the one who failed/disgraced **welcomed and restored** without losing face; **belonging (居場所, "a place where you belong") and being received** into God's family; the Father who runs to embrace the returning child (counter-cultural tenderness — use it deliberately). Themes of acceptance for the lonely/不登校/hikikomori-adjacent ache land powerfully.
  - **Fear–power** — the felt world of ancestral spirits (ご先祖様), curses, ritual purity, and unseen forces. Foreground **Christ's authority over every dark power**, light into darkness 闇に射す光, no fear of spirits because Jesus is Lord, freedom from the tyranny of fate/curse. Lands quietly but deeply.
  - **Guilt–innocence** (legal pardon) still matters — 罪赦され (sin forgiven) — but lead with honor/belonging and power images.
- **Taboo / danger images → safe substitutes:**
  - **Loud, exuberant, hands-up "dancing/partying" worship** reads as alien and embarrassing to many Japanese believers (very restrained worship). Keep the JOY but render it as **喜び躍る／心躍る** ("the heart leaps for joy") or quiet radiant gladness, not nightclub ダンス. (In the flagship hook "dancing" may stay as holy rejoicing — see §9.)
  - **"Buddy/homeboy Jesus"** — over-casual friendship reads as rude. Jesus is 主 (Lord) AND friend (友, John 15:15) — keep the friendship, never chummy/slangy.
  - **Wine "flowing like a river"** — render as the **joy/abundance of the wedding feast (婚宴の喜び)**, not drunkenness.
  - **Fire** — distinguish refining/Holy-Spirit fire (聖霊の火／精錬) from judgment; avoid incense/ritual-burning (お焚き上げ) connotations.
  - **Father imagery** — tender Father love is *deeply* healing where fathers are often absent/distant; render it warm and dignified (天の父の慈しみ), restrained not saccharine.
  - **Shinto/Buddhist religious objects & spirits** — never use 鳥居, お守り, 神社/お寺, 仏, ご先祖様, 八百万の神, おみくじ, さくら-as-spiritual, etc. in a Christian image. Keep the **神** unmistakably the one true God (§2, §0A.10).
- **Native ache word / sacred-longing idiom:** **切なさ (setsunasa)** — a bittersweet, tender ache/longing; and **慕う (shitau)** — to yearn for / long after (used of longing for God, Ps 42). Also **わび・さび** sensibility (beauty in impermanence/quiet) as an aesthetic register. Use 慕う for sacred longing toward God; 切なさ for the bittersweet ache the gospel meets. **Worship temperature: very restrained** (quiet, reverent, understated — let silence and space carry weight).
- **Charged vocabulary to handle with care:** **戦い/軍/勝利 (battle/army/victory)** — keep strictly **spiritual** (霊的戦い against sin/darkness), never militarist/nationalist (Japan's WWII history makes martial-nationalist tones dangerous). **王/王国 (king/kingdom)** — Japan has an Emperor (天皇); be careful that "King/Kingdom" reads as Christ's heavenly reign (御国/王の王), never as anything touching the imperial institution. Avoid 神風 (kamikaze) and any imperial-era resonances. Nation/homeland/blood imagery: keep heavenly (天の故郷), never ethnonationalist.
- **Reverence/honorific forms REQUIRED when addressing/speaking of God (keigo — mandatory):**
  - Use the **honorific prefix 御 (お／ご／み)**: 御名 (みな, His name), 御国 (みくに, His kingdom), 御子 (みこ, the Son), 御言葉 (みことば, His word), 御手 (みて, His hand), 御業 (みわざ, His work), 御血 (おんち, His blood).
  - Use **尊敬語 (respectful verbs) for God's actions**: 来てください／来られる (deign to come), おられる (to be, of God), 与えてくださる (graciously give), 愛してくださる (love us), なさる (do, honorific), 召される (call). Vocative: **主よ／父よ／イエスさま／神さま** (the 〜よ vocative and the 〜さま honorific suffix are reverent, not filler).
  - Use **謙譲語 (humble verbs) for the worshiper before God**: いただく (humbly receive), 仰ぐ (look up to), ひれ伏す (bow down), 賛美いたします (humbly praise).
  - **Omitting keigo toward God is jarringly disrespectful** — never address God in flat plain-form or casual speech. Maintain a consistent reverent register throughout.
- **Native poetic device to reach for:** Japanese poetry is built on **mora count and seasonal/nature imagery (季語-like), juxtaposition, and resonant silence (間, *ma*)** — NOT end-rhyme. Reach for **5/7 mora cadences** where they fit naturally, **体言止め** (ending a line on a noun for lingering effect), **掛詞**-style double meaning *only if it doesn't muddy the gospel*, and evocative nature imagery (light, dawn, water, wind/breath = 風/息 echoing 聖霊) that a Japanese ear finds beautiful. **Do NOT force end-rhyme (§4).**

---

## 2. DIVINE NAMES & THEOLOGICAL TERMS — LOCKED GLOSSARY (EN → JA)

| English | Japanese (use) | Notes / connotation |
|---|---|---|
| God | **神 (かみ)** — for the one true God | **THE KAMI-BAGGAGE FLAG (read carefully):** 神 (kami) is the ordinary Japanese word for "god/deity," and in Shinto it means a *polytheist nature/ancestral deity* (八百万の神, "eight million gods"). **The established Christian usage adopts 神 as the word for the one true God** — this is the settled convention in every Japanese Bible (新改訳/新共同訳) and church. So you DO use 神, but you **must NOT import Shinto/Buddhist deity connotations**: keep it singular, supreme, personal, and unmistakable by context — pair with 御 honorifics (御名), with 主, with 天の (heavenly), with 唯一の (the one and only) where helpful, and with 御子/聖霊. Never write or imply 神々 (plural gods), never 八百万の神, never associate with a 神社 (shrine). Context does the disambiguation 神 cannot do alone. |
| the Lord | title **主 (しゅ)** / vocative **主よ** | "Lord" = 主; "O Lord" = 主よ (reverent vocative). Furigana 主（しゅ） helps the vocal. |
| Jesus | **イエス** (イエス・キリスト) | Standard. (Catholic older texts use イエズス — for evangelical default use **イエス**, one spelling per album.) |
| Christ | **キリスト** | Universal. |
| Father (God) | title **父 (ちち) / 天の父** / address **父よ** | 天の父 = Heavenly Father; reverent and standard. |
| Holy Spirit | **聖霊 (せいれい)** | Protestant/evangelical default. (御霊（みたま） also used poetically.) |
| King (Christ) | **王 (おう) / 王の王** | 王の王 = King of kings. Keep it Christ's heavenly reign — NOT imperial (§1A). |
| Lamb (of God) | **子羊 (こひつじ)** (神の子羊) | |
| Savior | **救い主 (すくいぬし)** | |
| **Son of God** | **神の子 (かみのこ)** / reverent **御子 (みこ)** | **HARD RULE — never soften or remove divine sonship.** 神の子 / 御子 is the established term. Do not euphemize to "the one God sent / God's chosen one / God's servant" to reduce offense — keep **神の子**. Contextualize the *form*, never deny the *doctrine* (Law #2). |
| grace | **恵み (めぐみ)** | Pure "undeserved favor." Do NOT substitute 縁 (en, karmic bond) or 運 (luck) — those import non-Christian fate baggage. |
| holy / holiness | **聖 (せい) / 聖なる / 聖さ** | 聖なる = holy; carries the right set-apart-for-God sense in Christian usage. Avoid Shinto 清め (ritual purification) connotations — use 聖/きよい (kiyoi, clean/pure before God). |
| spirit / soul | spirit **霊 (れい)／御霊** ; soul **魂 (たましい)** | Fine in Christian use; never let 霊 drift toward 幽霊/亡霊 (ghost) or ご先祖様 (ancestor-spirit). |
| saved / salvation | **救われる / 救い (すくい)** | True rescue/deliverance from sin and death — not mere circumstantial relief. |
| redeemed | **贖われる (あがなわれる) / 贖い (あがない)** | 贖い = redeem/ransom (buy back at a price) — keep the blood/cost sense. Furigana 贖（あがな）い. |
| glory | **栄光 (えいこう)** | |
| repentance | **悔い改め (くいあらため)** | Genuine turning from sin, not mere regret (後悔). Keep 悔い改め. |
| mercy | **あわれみ / 慈しみ (いつくしみ)** | あわれみ = compassion-mercy; 慈しみ = tender lovingkindness. Avoid Buddhist 慈悲 (jihi) — use あわれみ/慈しみ. |
| righteousness | **義 (ぎ) / 正しさ** | God's 義; the believer counted 義. |
| the cross | **十字架 (じゅうじか)** | |
| the (empty) tomb | **(空の)墓 (はか)** | |
| the resurrection | **復活 (ふっかつ)** | |
| Kingdom | **御国 (みくに) / 神の国** | Heavenly reign; never imperial-political (§1A). |
| Bride / Bridegroom | **花嫁 / 花婿** | Biblical; keep pure. |
| wedding feast / marriage supper of the Lamb | **子羊の婚宴 (こんえん) / 婚礼の祝宴** | |
| Hallelujah | **ハレルヤ** | Standard. |
| Amen | **アーメン** | |
| Hosanna | **ホサナ** | |
| chains | **鎖 (くさり)** | |
| free / freedom | **自由 (じゆう) / 解き放たれる** | |
| joy | **喜び (よろこび)** | |
| **"It is finished" (Jn 19:30)** | **「完了した。」** (新改訳) | Exact; weighty, complete. (新共同訳: 「成し遂げられた。」 — both recognized.) |
| **"Come, Lord Jesus" (Rev 22:20)** | **「主イエスよ、来てください。」** | Reverent vocative + keigo request form. |
| **"Allah"** | **NEVER** — banned catalog-wide. Use 神. | Per SOP Core Non-Negotiable #18. Never import a divine name from another religion. |

**Never import a Shinto/Buddhist term or deity into a Christian slot:** not 仏/仏様 (Buddha) for God, not 神々/八百万の神 (plural deities), not 縁 (en/karmic fate) for grace, not 慈悲 (jihi, Buddhist mercy) for mercy, not 涅槃/極楽 (nirvana/Pure-Land paradise) for heaven, not 因果/業 (karma) for sowing/reaping, not ご先祖様 (ancestor-spirits). Keep divine-name usage **consistent album-wide** (one イエス spelling, 神 throughout, 御子/神の子 for the Son).

---

## 3. COINED / BRAND WORDS, PROPER NOUNS & LOANWORDS

- **Coined brand hooks stay (DO NOT translate).** The **"Jubilujah"/"Jubiluyah"** hook (Jubilee + Hallelujah) is the album's signature earworm and name — **keep it verbatim** in Latin letters, including the stripped-syllable post-chorus chant *"Ju-bi-loo-yah"* and the spelling-chant **J-U-B-I-L-U-J-A-H** (same letters; do not re-spell or katakana-ize the sung hook). A Japanese ear hears ハレルヤ inside it — that resonance is the point. (You may katakana-gloss it once in liner notes as ジュビルヤ, but the SUNG hook stays Latin-letter "Jubiluyah.") Same policy for any future coined hook.
- **Greek theological terms** as concepts: keep, with standard Japanese where one exists — *kairos* → **時 (とき)／神の時** ("Kairos Hour" → 神の時) or katakana **カイロス** only if the brand needs it; *chronos* → 時間/クロノス. Prefer the meaning-word; katakana-transliterate only as a deliberate brand choice.
- **Language & place names** (the "every tribe" track): use Japanese forms — Swahili → **スワヒリ語**, Mandarin → **中国語/北京語**, Spanish → **スペイン語**, Hindi → **ヒンディー語**, Portuguese → **ポルトガル語**, Arabic → **アラビア語**, Hebrew → **ヘブライ語**, Korean → **韓国語**. Keep the multilingual sweep; just localize the names.
- **Modern loanwords (katakana)** only where Japanese speakers really talk that way; prefer a clean Japanese word in reverent lines (愛 not ラブ; 神 not ゴッド). Katakana carries a pop/foreign register — use sparingly and deliberately (§0A.5). No youth slang/memes in worship.

---

## 4. SINGABILITY & PROSODY ( Japanese-specific )

- **Mora (拍) count — NOT syllable count — governs Japanese singing.** Each kana = one mora; a long vowel (おう), a small っ (sokuon), and final ん each count as their own mora (e.g. 東京 Tō-kyō = と・う・きょ・う = 4 mora). **Count mora to the melody**, matching the EN syllable count to the note count. Because Japanese is mora-dense and often longer than English, **compress by choosing shorter words/readings and dropping the pronouns and particles Japanese naturally omits** — never by adding filler (§0A.1). A held note can carry a long vowel rather than a padded word.
- **Japanese end-rhyme is NOT a feature — DO NOT force rhyme (LOCKED).** Classical and modern Japanese poetry does **not** use end-rhyme as an organizing device (it relies on mora-count, imagery, juxtaposition, and 間/silence). Because nearly all Japanese words end in one of only five vowels, "rhyme" is trivial and meaningless — chasing it produces stilted, filler-laden lines. **Do not match the EN rhyme scheme.** Instead reach for the native devices (§1A): clean mora cadences (5/7 where natural), 体言止め (noun-ending), evocative imagery, and resonant phrasing. If a pleasing sound-echo happens naturally, fine — but never bend a word for it.
- **Pitch-accent & flow:** Japanese has pitch-accent (not stress-timing). Don't force an unnatural accent; let phrases follow natural intonation and place key words on strong beats. Read every line aloud in rhythm. Japanese is mora-timed (each mora roughly equal length) — that even pulse suits melody well.
- **Open vowels on sustained/belted notes:** every kana ends in a vowel, which is a gift — land big held notes on **あ／お／え／う／い** finals (主よ -yo, 愛 -ai, 光 hikari, 御名 -na). Avoid ending a long note on a clipped っ or a heavy consonant cluster (rare in JA but watch katakana loanwords).
- **Keep the hook's exact rhythmic slot** (it lands at 0:00–0:08; keep it there); the chorus arrives on the same bar.
- **No Romance-style contractions**, but compress with: shorter readings (主 しゅ vs 主なる神), dropping subject pronouns, choosing 来て over 来てください where keigo is otherwise carried, and casual-but-still-reverent vocatives where the melody is tight. Never sacrifice keigo toward God to save mora — recast the line instead.
- **Script & furigana mandatory where helpful:** Suno/TTS pronounce from the text and may misread kanji — supply **furigana** for any kanji whose reading could be wrong or that has multiple readings (主（しゅ）, 御子（みこ）, 贖（あがな）い, 御国（みくに）, 復活（ふっかつ）). Verify katakana is correct for any loanword/transliteration.
- **Euphony / accidental-obscenity screen:** sing the line aloud at speed (mora blurred, as the AI vocal will render it) and confirm the slurred mora don't form a vulgar, comic, or sacred-taboo word, and that no run-together phrase reads as something unintended.

---

## 5. IDIOMS, IMAGERY & CULTURAL FIT

- **Translate the sense, not the words → native idioms / 慣用句 where they fit naturally**, and reach for Japanese nature/seasonal imagery (dawn 夜明け, light through cloud, still water, wind/breath 風・息 echoing 聖霊) which Japanese ears find moving. Never jam an idiom in if it distorts meaning (§0A).
- **Keep concrete sensory anchors** (bathroom floor at 3 AM, cage door, wedding feast, wine like a river) rendered vividly in Japanese (深夜三時の床に). Localize culture-bound **daily-life** anchors (carpool line, diner, prom, credit-card debt) to emotionally equivalent native scenes (通学の電車, 深夜のコンビニ, 終わらない請求書) — do NOT localize away the **global/heaven imagery** (あらゆる民・国 every-tribe, 御座 throne, 子羊 Lamb, 婚宴 wedding feast).

---

## 6. WHAT STAYS IN ENGLISH (never translate) + STYLE METADATA RULE

- **Suno section tags & production cues** in `[brackets]` — `[Intro] [Verse 1] [Pre-Chorus] [Chorus] [Post-Chorus] [Bridge] [Breakdown] [Build] [Drop] [Outro] [Choir] [Harmony] [Whisper] [Ad-lib] [Key Change] [Silence] [Fade Out]`. Never sung — leave exactly as the EN source.
- **The `Style` / `Styles:` metadata block STAYS IN ENGLISH** (Suno production direction, not sung). Update it — in English — for JA production: (a) add **"Japanese-language vocal"** near the front; (b) keep BPM/key/instruments/mood anchors; (c) fold in §10 addictiveness tuning (hook-forward, groove pocket/BPM, ear-candy, dynamic arc, and culturally resonant instrumentation from §1A — e.g. tasteful 琴 koto / 尺八 shakuhachi / 太鼓 taiko / 笙 shō accents, or clean restrained J-pop/CCM textures, where the style allows). Translate nothing inside it.
- **The coined hook + spelling-chant** (§3).
- **Metadata footers** (VOCAL GENDER, ratings, Song Title, Save To) — keep structure; `Song Title:` / `SONG TITLE:` lines use the **Japanese** song title (track-number prefix kept), see §7.

---

## 7. FILE, CODE & TITLE CONVENTIONS

- **Album code:** swap the language suffix **`EN` → `JA`** (e.g., `JEIM1069EN` → `JEIM1069JA`). Everything else stays.
- **Folder:** mirror the EN album's folder with the JA code: `…/<persona>/<CODE>JA-<slug>/lyrics/`. (Slug may be romaji of the Japanese title.)
- **Lyrics filename:** `<Persona> Inspire-<Japanese Album Title>-lyrics.md` (persona name stays in English — artist brand).
- **Song titles → Japanese** (each prefixed with its 2-digit track number): e.g., `SONG TITLE: 02 今、歌おう` and matching footer `Song Title: 02 今、歌おう`.
- **Album title:** native Japanese title UNLESS the title IS the coined brand hook. For **"Jubilujah,"** the title IS the brand earworm → **keep "Jubilujah"** (language-neutral coined word); do not invent a separate translation that breaks the brand. Document in the changelog. (Non-coined titles → natural Japanese, ≤30 chars, unique.)
- **`Save To:`** = the JA album title.
- **Changelog/header note:** state this is the JA translation of `<EN code>`, the divine-name convention (神; イエス; 御子/神の子; keigo register), the coined-hook policy, the furigana policy, and the **worldview frame chosen** (honor-shame + fear-power, §1A).

---

## 8. QA CHECKLIST (run before delivering any JA album)

- [ ] **Sing-through:** every line read aloud in rhythm fits the melody; **mora count** matches the note count; no rushed or padded bars; no filler particles.
- [ ] **Mora check** on hook + chorus vs EN syllable/note count (±1; hook exact).
- [ ] **NO forced rhyme** — confirm no line was bent to chase end-rhyme; native devices (mora cadence, 体言止め, imagery) used instead (§4).
- [ ] **Keigo present and consistent** — God addressed with honorific register (御 prefixes, 尊敬語 verbs, 主よ/父よ/神さま vocatives, 謙譲語 for the worshiper); NO flat plain-form or casual speech toward God.
- [ ] **Correct script** (kanji+kana) in all sung text AND titles; **furigana supplied** for any ambiguous/multi-reading kanji; katakana correct; は/が, に/で, transitive/intransitive correct.
- [ ] **Divine-name consistency** — 神 throughout; one イエス spelling; glossary (§2) honored; **Son of God = 神の子/御子 intact (never softened).**
- [ ] **KAMI-baggage screen** — every 神 is unmistakably the one true God by context; no Shinto/Buddhist deity, plural-gods, 八百万, shrine/temple, ご先祖様, 仏 connotations anywhere (§0A.10, §2).
- [ ] **Scripture echoes** match 新改訳 / 新共同訳 — e.g. John 19:30 「完了した。」, Rev 22:20 「主イエスよ、来てください。」.
- [ ] **Non-offense pass:** no vulgar/slang/youth-meme; very-restrained reverent register; no Catholic/Orthodox/charismatic partisan imports; no Marian/saint devotion; no romantic-pop God-imagery; no militarist/imperial/nationalist tone; gospel intact.
- [ ] **Cultural-resonance pass (§1A):** honor-shame + fear-power frame foregrounded; every image checked vs the taboo list (dancing→喜び躍る; wine→婚宴の喜び; no Shinto/Buddhist objects; folk-luck/fate subordinate); native ache word (切なさ/慕う) present where the song aches; charged vocabulary (war→霊的戦い, king/kingdom non-imperial) cleared.
- [ ] **No Shinto/Buddhist term in a Christian slot** (no 仏/縁/慈悲/涅槃/極楽/因果/ご先祖様); no foreign-religion divine name; **no "Allah"** (`grep -i allah` → 0).
- [ ] **Coined hook preserved verbatim** (Jubilujah / Ju-bi-loo-yah / J-U-B-I-L-U-J-A-H).
- [ ] **`Style` block English-only**, updated with "Japanese-language vocal" + §10 tuning + (optional) Japanese instrumentation cues.
- [ ] **Back-translation + comprehension check** — back-translate the chorus independently; a native Japanese believer confirms it says what the EN meant and reads naturally (not 翻訳調).
- [ ] **Drop-the-rhyme/filler test on EVERY line**; only real words + correct grammar (particles, transitive/intransitive, keigo forms); no stranded tails; intentional 体言止め only.
- [ ] **Register/loanword check** (katakana used sparingly, no slang in worship); **euphony pass** — sung aloud at speed, no accidental obscene/comic/taboo word.
- [ ] **Image consistency**; **theology over sound** (fate/luck subordinate to God's sovereignty).
- [ ] **NATIVE FAITH-INSIDER SIGN-OFF** (hard release gate) — a Japanese believer/worship leader approves.
- [ ] **Addictiveness re-rating done (§10)** with before/after scores and report.
- [ ] **Naturalness** — reads as original Japanese songwriting, not a translation.

---

## 9. WORKED EXAMPLE (chorus)

**EN (Jubilujah, T1 chorus):**
> Jubiluyah! Jubiluyah! / Jesus is the reason we are dancing now! / Jubiluyah! Jubiluyah! / The King is coming back — somehow, somehow!

**JA (singable, hook kept, meaning kept, NO forced rhyme, keigo-reverent, frame-appropriate; 神/イエス):**
> Jubiluyah！Jubiluyah！/ イエスがいるから、今 心は躍る！/ Jubiluyah！Jubiluyah！/ 王は必ず帰られる —— きっと、きっと！

*Why it works:* hook verbatim and on the same beat; **イエス** consistent name; "Jesus is the reason we are dancing now" → **イエスがいるから、今 心は躍る** ("because Jesus is here, now my heart leaps") — keeps the JOY of "dancing" but renders it as **心が躍る** (the heart leaps for joy), which is natural and restrained-worship-safe (§1A — exuberant ダンス would read as alien); "the King is coming back" → **王は必ず帰られる** uses **帰られる** (the 尊敬語/honorific form of "to return") — **keigo toward God is mandatory** (§1A), and 必ず ("surely") + きっと、きっと replaces the vague "somehow, somehow" with the **certainty of the Second Coming** (better theology than the English vagueness), preserving the double-beat. **No end-rhyme was forced** (躍る/帰られる/きっと don't rhyme — and shouldn't; Japanese doesn't rhyme, §4); the lines work by clean mora cadence and meaning. 心躍る/帰られる count cleanly to the melody. Zero offense across Protestant/Catholic.

**BAD vs GOOD (the lesson of §0A & §4):** you're tempted to "rhyme" or pad the King line.
- ❌ Forced rhyme + dropped keigo + filler: *「王は帰るよ、運命のままに、ああ！」* — three failures: (1) **帰る is plain-form** — addressing God without keigo is jarringly disrespectful (§1A); (2) **運命 (fate) steals God's sovereignty** (§0A.9, §2 — His return is His promise, not fate); (3) trailing **ああ** is pure filler to fill mora (§0A.1); and chasing a vowel-echo is pointless since Japanese vowel-endings "rhyme" trivially (§4).
- ✅ Meaning-first, keigo intact: *「王は必ず帰られる —— きっと、きっと！」* — honorific 帰られる, sound doctrine (His certain return), clean cadence, restrained-reverent, no forced rhyme.
- ✅ Also fine (体言止め, noun-ending): *「再び来られる、栄光の王。」* — ends on the noun 王 (体言止め) for lingering effect; honorific 来られる; true and dignified. **A true, reverent, unrhymed line is exactly right in Japanese.**

---

## 10. ADDICTIVENESS / RE-LISTENABILITY PASS (after the album is produced in Japanese)

Run **three listen passes** on each produced track:
1. **Feeling pass** — does it move you emotionally on first listen? Where does it sag?
2. **Craft pass** — hook clarity, groove, vocal delivery, mix, arrangement.
3. **Replay-triggers pass** — what makes you hit repeat? (earworm hook, a turnaround, a payoff moment, a loop point).

Then **amplify** (tuning the ENGLISH `Style` block §6 and the Suno re-gen prompt ONLY — never doctrine or the locked translation):
- **Hook & delivery** — make the "Jubiluyah" hook front-loaded, sticky, well-placed; tighten the vocal performance note.
- **Groove & pulse** — target a head-nod pocket (~100–128 BPM where the style allows); steady, sway-able feel suited to the restrained register.
- **Texture & ear-candy** — tasteful fills, counter-melodies, and **culturally resonant instrumentation from §1A** (koto/shakuhachi/taiko/shō accents, or clean J-pop/CCM textures) for distinctiveness; restrained, never gimmicky.
- **Dynamic arc & payoff** — build → lift → final-chorus payoff; use 間 (space/silence) for emotional weight, then release.
- **Loop point & album flow** — strong intro/outro so the track loops and the album sequences well.
- **Emotional pull & relatability** — lean on §1A's **honor-shame/fear-power frame** and the **ache words 切なさ/慕う** so the feeling lands for a Japanese listener.

**Re-rate each track + the album BEFORE/AFTER** across: hook strength, groove, replay value, dynamic payoff, emotional pull, loop-ability. Deliver a summary of changes, **why each boosts re-listening**, and the measurable before→after effect. This pass tunes production only — it never edits the locked translation or any doctrine.

---

**Authority:** the project owner (Daddy / Gabriel) holds final approval on all Japanese releases. When uncertain about a denominational or cultural sensitivity, choose the broadest, most Scripture-plain option and flag it. Shaddai leads; the nations hear it — すべての民が、おのおのの言葉で。
