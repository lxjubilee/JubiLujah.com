// One-shot: replace each article's `imagePrompt:` frontmatter line with a
// brighter, more hopeful, marketing-driven brief. Leaves every other line
// (including any `image:` filename already set) untouched.
//   node core/articles/retheme-prompts.mjs   then   node core/articles/gen-articles.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PROMPTS = {
  'why-the-tired-church-doesnt-need-a-better-program':
    'A warm country church at golden hour with its doors thrown open and light spilling out onto the steps, a diverse group of people in soft focus greeting and embracing as they arrive, warm string lights and wildflowers by the path, a joyful sense of homecoming and belonging; bright uplifting editorial photography, rich golden and amber tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'joy-isnt-the-reward-for-revival':
    'A radiant open doorway flooding a room with warm golden light and drifting sparks like celebration, a joyful silhouetted figure stepping through toward music and light beyond, uplifting and full of momentum; vibrant cinematic painterly style, gold amber and honey tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'why-church-feels-so-loud':
    'A serene sunlit nook by a big bright window at golden morning, a soft cozy chair and sheer glowing curtains, a single healthy potted plant, warm airy and full of gentle peace; bright uplifting lifestyle photography, soft pastel and honey tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-one-question-that-ends-the-argument-about-god':
    'A warm lantern-lit doorway glowing at golden dusk at the end of a welcoming path, a distant figure walking home along a road lit by warm light, olive trees and soft bokeh, a deep feeling of welcome and homecoming; luminous cinematic style, honey-bronze and warm gold tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'what-the-fatherless-are-really-asking-for':
    'A golden sunrise over an open road where a joyful figure runs with open arms toward a young silhouette, warm light breaking across the hills, a powerful hopeful sense of being wanted and welcomed home; uplifting cinematic photography, warm amber and rose-gold tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'fire-still-falls-on-dead-altars':
    'A triumphant hilltop at dawn with warm embers and sparks rising into a glowing sunrise sky, radiant beams of light breaking through the clouds, an energetic sense of renewal and fresh fire; vibrant cinematic painterly style, fiery gold orange and warm rose tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'reading-your-bible-in-the-wrong-language':
    'Bright morning sunlight streaming across an open scroll and fresh olive branches on a warm wood table, dust motes glowing in the beam, an inviting sense of discovery and living wisdom; warm uplifting editorial style, honey amber and soft green tones, wide 16:9 landscape, no text, no logos, no legible letters, no recognizable faces.',
  'the-money-conversation-the-church-keeps-dodging':
    'Bright open hands lifted into warm sunrise light releasing glowing golden seeds that drift over rich green fields, an uplifting feeling of generosity, growth and freedom; vibrant hopeful photography, marigold amber and fresh green tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'build-the-thing-that-outlasts-you':
    'A sunrise breaking golden over a strong new foundation and timber scaffolding reaching hopefully upward into bright open sky, warm light and long clean shadows, an aspirational sense of vision and momentum; uplifting cinematic architectural style, warm gold and fresh blue tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-people-no-one-remembered-to-disciple':
    'A warm inviting hall at golden hour with a welcoming circle of chairs and light pouring through open doors, one chair drawn in warmly as if saving a place, a hopeful feeling of belonging and being sought; bright uplifting lifestyle style, warm amber and soft honey tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-song-you-cant-sing-yet':
    'Soft golden dawn light breaking through a window onto an acoustic guitar resting by a cozy chair with a warm quilt, gentle warmth returning to a peaceful room, tender and hopeful; bright soft lifestyle photography, warm amber and gentle blue tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-reason-we-sing-when-words-run-out':
    'A joyful silhouette singing with arms lifted at radiant sunrise, warm ribbons of light rising like music into a bright sky, an exuberant celebratory feeling of overflow; vibrant uplifting cinematic style, gold amber and warm coral tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'why-the-saddest-songs-bring-the-most-comfort':
    'A cozy warmly-lit interior at night with soft golden lamplight and a rain-jeweled window catching gentle city bokeh, an intimate comforting glow that feels safe and warm; warm cinematic lifestyle style, amber and soft teal tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'what-music-does-to-a-grieving-body':
    'Warm morning light easing into a softly lit room where gentle sunlight touches a harp beside a comfortable chair, a feeling of comfort and quiet relief settling in; soft uplifting lifestyle photography, warm honey and calming green tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'david-wrote-his-worst-days-into-songs':
    'A warm firelit cave mouth opening onto a bright sunrise valley with rolling hills, a simple wooden harp catching the golden light, a hopeful sense of honesty giving way to dawn; uplifting cinematic style, warm amber and fresh dawn-blue tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-psalms-were-never-meant-to-be-read-silently':
    'A lively warm scene of a wooden lyre and a hand-drum beside an open scroll bathed in bright golden light, sound suggested as glowing ripples in the air, festive and alive with music; vibrant uplifting painterly style, rich gold and warm terracotta tones, wide 16:9 landscape, no text, no logos, no legible letters, no recognizable faces.',
  'the-song-that-opened-the-prison-at-midnight':
    'A triumphant burst of warm golden light breaking through a swinging open door as chains fall away and dawn floods in, a powerful energetic sense of freedom and breakthrough; vibrant cinematic style, radiant gold and warm amber tones against retreating shadow, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'what-happens-when-you-put-the-singers-in-front':
    'A bright hopeful sunrise over a mountain pass with a small joyful group walking forward with raised hands into streaming golden light, a triumphant sense of faith leading the way; uplifting epic cinematic style, radiant gold and fresh morning-blue tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-worship-no-one-is-meant-to-hear':
    'A solitary figure on a bright sunlit ridge with face lifted upward, a glowing golden landscape rolling to the horizon, radiant and peaceful and full of quiet joy; uplifting cinematic style, warm gold and vivid sky-blue tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-song-stuck-in-your-head-is-discipling-you':
    'A bright cheerful sunlit kitchen in the morning with warm light and a glowing suggestion of musical notes rippling through the air, an upbeat everyday feeling of a song that lingers; vibrant lifestyle photography, warm sunny yellow and soft aqua tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'you-are-being-sung-over':
    'A tender warm nursery glowing with soft golden light before dawn, a cozy rocking chair and a gentle nightlight, a deeply safe and comforting feeling of being watched over; soft uplifting lifestyle style, warm gold and gentle blush tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'i-will-not-offer-what-costs-me-nothing':
    'A warm glowing threshing floor at golden sunset with abundant golden wheat and rising light and an open generous hand, a rich uplifting harvest feeling of wholehearted offering; vibrant cinematic style, warm gold and amber tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-melody-that-sounds-like-home-in-every-language':
    'A bright warm twilight horizon where many colorful glowing lights rise like ribbons of music from across a landscape, all bending toward one radiant welcoming gate on the skyline, hopeful and unifying; vibrant cinematic painterly style, gold turquoise and warm rose tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-music-you-reach-for-at-2am':
    'A cozy night bedroom with a warm inviting glow and the very first hint of dawn light at the window, earbuds resting on a nightstand, a hopeful feeling of morning on the way; warm cinematic lifestyle style, deep blue giving way to warm gold, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-voice-you-think-is-too-broken-to-sing':
    'A beautiful cracked clay vessel on a sunlit windowsill with warm golden light streaming through the fracture and glowing outward, radiant and redemptive, a hopeful feeling that the broken place is where the light gets out; uplifting fine-art style, warm amber and soft gold tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'the-shout-that-went-up-when-the-foundation-was-laid':
    'A bright hopeful hilltop at golden hour with fresh pale foundation stones and warm dust rising in the light, radiant beams breaking through, an energetic joyful groundbreaking-celebration feeling; uplifting cinematic style, warm gold and clear blue tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'what-a-melody-does-that-a-sermon-cant':
    'A warm glowing worship moment with soft-focus silhouettes of a joyful crowd, hands lifted into radiant beams of golden light and drifting light particles, uplifting and moving; vibrant concert-style photography, warm gold and amber tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'why-darkness-cannot-stand-a-worshiper':
    'A radiant burst of warm golden light expanding outward and pushing shadow to the edges of the frame, glowing sparks rising, a triumphant energetic sense of light overcoming dark; vibrant cinematic style, brilliant gold and warm amber against retreating blue-black, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'if-we-go-silent-the-stones-will-sing':
    'A glorious bright dawn over glowing hills and rolling mist with a single stone in the foreground catching radiant light, the whole landscape luminous and alive as if singing; vibrant uplifting cinematic style, warm gold and fresh dawn tones, wide 16:9 landscape, no text, no logos, no recognizable faces.',
  'why-the-old-hymns-still-undo-grown-men':
    'Warm afternoon sunlight pouring across an open hymnal on a windowsill with golden light and soft dust motes, a nostalgic yet bright and hopeful feeling of memory and homecoming; warm uplifting lifestyle photography, rich amber and honey tones, wide 16:9 landscape, no text, no logos, no legible text, no recognizable faces.',
};

let n = 0, missing = 0;
for (const [slug, prompt] of Object.entries(PROMPTS)) {
  const file = path.join(HERE, slug + '.md');
  if (!fs.existsSync(file)) { console.log('MISSING file:', slug); missing++; continue; }
  let raw = fs.readFileSync(file, 'utf8');
  if (!/^imagePrompt:.*$/m.test(raw)) { console.log('no imagePrompt line:', slug); missing++; continue; }
  raw = raw.replace(/^imagePrompt:.*$/m, () => 'imagePrompt: ' + prompt);
  fs.writeFileSync(file, raw);
  n++;
}
console.log(`Rewrote ${n} prompts` + (missing ? `, ${missing} missing` : ''));
