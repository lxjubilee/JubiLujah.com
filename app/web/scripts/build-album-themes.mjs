// One-shot assembler for album-themes.json.
// Merges the per-album themes produced by the theme-analysis agents (8 batches),
// keeps the hand-crafted SEED themes on any overlap, normalizes a few >5-word
// phrases, and enforces the 5-word-max rule (warns on any violation).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'music', 'album-themes.json');

// Hand-crafted, already-reviewed themes — win on any conflict with agent output.
const SEED = {
  JEIM1069EN: "Celebrate Christ's Soon Return",
  JEIM1070EN: 'Glorify God, Fill Heaven',
  JEIM1002EN: 'Christ Is Risen',
  CAIM1001EN: 'Jesus, My Steadfast Anchor',
  IMIM1001EN: 'Set Free By Jesus',
  ZHIM1001EN: 'Dry Bones Come Alive',
  SAIM1001EN: 'Christ Reigns Over All',
  SAIM1002EN: 'Prayers Answered Through Generations',
  EAIM1001EN: 'Jesus Is All You Need',
  MDIM1001EN: 'Hearts Opening To Love',
  AMIM1001EN: 'Arab Hearts Worship Jesus',
  ZEIM1001EN: 'One New Humanity In Christ',
  THIM1002EN: 'Healing Generational Wounds',
};

// Agent output, batch 1 (Caleb + Eliana start) — >5-word entries trimmed here.
const B1 = {
  CAIM1001EN: 'Held Steady Through the Storm', CAIM1002EN: "Spirit's Fire Awakened", CAIM1003EN: 'Every Chain Released',
  CAIM1004EN: 'Chosen and Sent With Purpose', CAIM1005EN: 'Boldly Telling What Grace Did', CAIM1006EN: 'Breaking the Cycle, Blessing Generations',
  CAIM1007EN: 'Commissioned and Sent Forth', CAIM1008EN: 'Shame Falls, Grace Wins', CAIM1009EN: 'Slow Healing, Faithful Presence',
  CAIM1010EN: "God's Kingdom Already Here", CAIM1011EN: 'Faith Passed Down Generations', CAIM1012EN: "Safe Under God's Wings",
  CAIM1013EN: 'Christ Pulled Me Back', CAIM1014EN: 'Death Loses, Hope Rises', CAIM1015EN: 'He Is Risen Indeed',
  CAIM1017EN: 'Welcomed to the Table', CAIM1018EN: 'Grace Sent Into the World', CAIM1019EN: 'Reconciled and Reunited',
  CAIM1020EN: 'Honest Doubt, Faithful God', CAIM1021EN: 'Joyful Praise Right Now', CAIM1022EN: "Christ's Presence in the Room",
  CAIM1023EN: 'Jesus Crowned King of All', CAIM1024EN: 'Jesus Reigns in My Heart', CAIM1025EN: 'Bowing Before the King',
  CAIM1026EN: 'Joy That Dances Before God', CAIM1027EN: 'The Kingdom Is Already Here', CAIM1028EN: 'Christ Returns, His Reign Begins',
  CAIM1029EN: 'The Cross Declares His Love', CAIM1030EN: 'Loved Forever, The Anchor Held',
  EAIM1001EN: 'The Name Above All Names', EAIM1002EN: "A Grandmother's Faithful Legacy", EAIM1003EN: "God's Grace Through Every Season",
  EAIM1004EN: 'Rooted in Faith, Rising Together', EAIM1005EN: 'Faith Taught and Handed Down',
};

// Batch 2 (Eliana + Elias) — >5-word entries trimmed here.
const B2 = {
  EAIM1006EN: 'God Weaves Many Into One', EAIM1007EN: 'Keepers of Sacred Memory', EAIM1008EN: 'All Welcome at the Table',
  EAIM1009EN: 'Faith Hope and Love Remain', EAIM1011EN: 'Every Story of Faith Matters', EAIM1012EN: 'The Slow Work of Community',
  EAIM1013EN: 'Courage to Stand for Truth', EAIM1014EN: 'Passing the Commission Forward', EAIM1015EN: 'Christ the Safe Healing Place',
  EAIM1016EN: 'Jesus Is at Home Here', EAIM1017EN: 'Wisdom Before Every Decision', EAIM1018EN: 'Passing Christ Down Generations',
  EAIM1019EN: 'Christ Keeps the Light On', EAIM1020EN: 'Jehovah-Jireh Provides, We Steward', EAIM1021EN: 'Christ Commissions His Daughters',
  ELIM1001EN: 'Saints at the Frontier Altar', ELIM1002EN: 'New Mercies With Every Dawn', ELIM1003EN: 'Christ Exposes Every Disguise',
  ELIM1004EN: 'The Prophet Rises to Speak', ELIM1005EN: 'Stolen Land, Sacred Covenant', ELIM1006EN: 'Covenant Belonging Around the Fire',
  ELIM1007EN: 'From the Dust to Resurrection', ELIM1008EN: "The Prophet's Burden and Witness", ELIM1010EN: 'Church Confessing and Turning Back',
  ELIM1011EN: 'Working Hands Are Holy Ground', ELIM1012EN: 'Spirit Fire on the Mountain', ELIM1013EN: 'Outlaw Redemption on Red Dirt',
  ELIM1016EN: 'Handing On the Mantle', ELIM1017EN: 'Forever Sent on the Trail', ELIM1018EN: "A Father's Covenant",
  ELIM1019EN: 'Called Out to the Frontier', ELIM1020EN: 'Leading by Raising What Follows', ELIM1021EN: 'Purified Alone in the Wilderness',
  ELIM1022EN: 'Broken Things Restored',
};

// Batch 3 (Elias tail + Gabriel + Imani + Jubilee start)
const B3 = {
  ELIM1023EN: 'Faith That Holds Fast', ELIM1024EN: 'God Brings Justice Home', ELIM1045EN: 'Making God Famous Together',
  GBIM1001EN: 'Blessings Chasing You Down', GBIM1002EN: 'Speak and Mountains Move', IMIM1001EN: 'Deliverance Has a Sound',
  IMIM1002EN: 'Jesus Breaks Every Chain', IMIM1003EN: 'I Am Finally Free', IMIM1004EN: 'Your Testimony Breaks Chains',
  IMIM1005EN: 'Delivered Ones Deliver Others', IMIM1006EN: 'Acts Two Is Right Now', IMIM1007EN: 'Everything on the Altar',
  IMIM1008EN: "God's Blessing Crosses Generations", IMIM1009EN: 'Healed Then Healing Others', IMIM1010EN: 'Holy Ghost Power Promised',
  IMIM1011EN: 'From Midnight Into Morning', IMIM1012EN: 'Jesus Still Works Miracles', IMIM1013EN: 'The Spirit Never Stops',
  IMIM1014EN: 'Daughters Rise and Prophesy', IMIM1015EN: 'God Speaks Through Dreams', IMIM1016EN: 'Dance Like David Danced',
  IMIM1017EN: 'The Shout Breaks Walls', IMIM1018EN: 'Ancient Circle Still Speaks', IMIM1019EN: 'One Spirit Every Nation',
  IMIM1020EN: 'Revival Walks the Streets', IMIM1021EN: 'Seers Walk the City', JEIM1001EN: 'He Is Coming Back',
  JEIM1002EN: 'The Stone Stays Rolled', JEIM1003EN: 'Heaven Landed on the Floor', JEIM1004EN: 'All Nations Sing Together',
  JEIM1005EN: 'Rooted Deep in Christ', JEIM1006EN: 'Light Breaks Into Darkness', JEIM1009EN: 'The King Reigns Forever',
  JEIM1010EN: 'Prayer Outlives the Pray-er',
};

// Batch 4 (Jubilee) — agent's final 5-word-max corrected set.
const B4 = {
  JEIM1011EN: 'Joy Let Off the Leash', JEIM1012EN: 'The Lion Still Roars', JEIM1013EN: 'Grief That Earns Its Praise',
  JEIM1015EN: 'Mercy Arrives Before You Ask', JEIM1016EN: 'Every Nation Bows Now', JEIM1017EN: 'Questions Become Holy Fire',
  JEIM1018EN: 'The Cross Began the Song', JEIM1019EN: "God's Table Has Your Name", JEIM1020EN: 'Joy Outlasts the Grave',
  JEIM1021EN: 'The Wounded King Still Reigns', JEIM1022EN: "Entering Heaven's Throne Room", JEIM1023EN: 'Walking in Finished Victory',
  JEIM1024EN: 'The Resurrection Changes Everything', JEIM1026EN: 'Thorns Became the Crown', JEIM1027EN: 'The Jubilee Never Closed',
  JEIM1028EN: 'The Throne Is Already Settled', JEIM1029EN: 'The Skies Cannot Hold Him', JEIM1031EN: 'Every Captive Walks Out Free',
  JEIM1032EN: 'Lion Turns, Lamb Is Crowned', JEIM1033EN: "The King's Reign Brings Peace", JEIM1034EN: "David's Harp Finds Its King",
  JEIM1035EN: 'The Father Ran First', JEIM1036EN: 'Tears Became Seeds, Zion Rises', JEIM1037EN: 'No Longer Forsaken, Now Married',
  JEIM1038EN: "Eden's Tree Returns in Christ", JEIM1039EN: 'Your Seat at the Feast', JEIM1040EN: 'Jesus Crowned, the Praise Completes',
  JEIM1062EN: 'The Watching Bride Meets Him', JEIM1063EN: 'The Veil Is Torn: Enter', JEIM1064EN: 'Fruit in Every Season Still',
  JEIM1065EN: 'God Came Small to Us', JEIM1071EN: 'Celebrating the Father of All',
};

// Batch 5 (Nova + Radiant Stones start) — one >5-word entry trimmed.
const B5 = {
  NVIM1001EN: "Healing From Trauma's Echoes", NVIM1002EN: 'Kindness Before Doctrine', NVIM1003EN: 'Finding Voice After Silence',
  NVIM1004EN: 'Surrendering Fallow Ground', NVIM1005EN: 'Carrying the Grieving Home', NVIM1006EN: 'Descending Into Buried Wounds',
  NVIM1007EN: 'The Prodigal Comes Home', NVIM1008EN: 'Restoring Wasted Years', NVIM1009EN: 'Rekindling Faded Faith',
  NVIM1010EN: 'Wounds That Testify Healing', NVIM1011EN: 'Doubt Refined Into Faith', NVIM1012EN: 'Words Left Unsaid',
  NVIM1014EN: "Enduring God's Silence", NVIM1015EN: 'Rescued in Darkest Night', NVIM1016EN: 'Grieving With Enduring Hope',
  NVIM1017EN: 'Where Heaven Touches Earth', NVIM1018EN: "Trusting God's Delay", NVIM1019EN: 'Faith Through Medical Crisis',
  NVIM1020EN: 'Making Peace With Doubt',
  JMZM1001EN: 'Joy As a Living Stone', JMZM1002EN: 'Jesus Is Living Water', JMZM1003EN: 'Unbreakable Identity in Christ',
  JMZM1004EN: 'Praise Ignites Like Altar Fire', JMZM1005EN: 'From Dust to Glory', JMZM1006EN: "Home in the Father's House",
  JMZM1007EN: 'Jesus Our Daily Bread', JMZM1008EN: 'Jesus Our Sacred Refuge', JMZM1009EN: "Standing at Kingdom's Door",
  JMZM1010EN: 'Bold Unashamed Gospel', JMZM1011EN: "Church as Christ's Beloved Bride", JMZM1012EN: 'Bride Walks to Her King',
  JMZM1013EN: 'The Bride Made Beautiful', JMZM1014EN: 'The Marriage Supper Comes', JMZM1015EN: 'Love Sealed by Covenant Blood',
};

// Batch 6 (Radiant Stones tail + Santiago + Tahoma + Zariah + Melody + misc faith + party start)
const B6 = {
  JMZM1016EN: 'Chosen by Sovereign Love', JMZM1017EN: 'Marriage of the Lamb', JMZM1018EN: 'Burning Wholehearted Love',
  JMZM1019EN: 'Crowned Queen Beside Jesus', JMZM1020EN: 'Co-Reigning With Christ', JMZM1041EN: 'Stones Awakened to Praise',
  SAIM1001EN: 'Jesus Reigns Every Rhythm', THIM1048EN: 'Honoring Elders Who Pointed', THIM1049EN: 'Pacific Unity in Christ',
  THIM1050EN: 'Living Your Sacred Calling', ZHIM1002EN: 'Africa Awakened to Praise', ZHIM1003EN: 'Faith Rooted in Ancestors',
  ZHIM1004EN: "Calypso Carries Christ's Mind", ZHIM1005EN: 'Island Praise Belongs to Jesus', ZHIM1007EN: 'Praying Women Carry Generations',
  ZHIM1009EN: 'Rising With Christ Forever', ZHIM1011EN: 'Jesus Heals the Scattered', ZHIM1013EN: 'Island Vernacular as Theology',
  ZHIM1017EN: 'Mercy Is the Revolution', ZHIM1018EN: 'Ancestral Roots Rising Now', ZHIM1021EN: 'Women Rising in Faith',
  MDIM1002EN: 'Love That Hits Like Thunder', MDIM1003EN: 'The Choice to Stay', CEF001EN: "Jesus's Seven I AMs",
  vol: 'Gospel Through the Nativity', IXMH001EN: 'Mercy Lifted Into Song', IMX505: 'Born to Sing His Praise',
  IX401EN: "Rooster's Joyful Barnyard Calling", IX402EN: "Pug's Snorty Party Blast", IX403EN: "Gator's Jazzy Dance Jam",
  IX404EN: "Elephant's Big-Faith Jungle Bash", IX405EN: "Peacock's Royal Praise Parade",
};

// Batch 7 (party-giggles tail + tiny-tiggles start)
const B7 = {
  IX406EN: "Tiki's Treasure Hunt Party", IX407EN: "Fox's Masked Forest Ball", IX408EN: "Tiger's Jungle Tango",
  IX409EN: "Kangaroo's Outback Bounce Bash", IX410EN: "Hyde's Wild West Stomp", IX411EN: "Monkey's Banana Jungle Bash",
  IX412EN: "Lion King's Jungle Jam", IX413EN: "Owl's Moonlight Dance Ball", IX414EN: "Whale's Deep-Sea Waltz",
  IX415EN: "Swan's Broadway Spotlight Show", IX416EN: "Pigeon's Rooftop Choir Fiesta", IX417EN: "Goat's Banjo Hoedown",
  IX418EN: "Dolphin's Hawaiian Luau Splash", IX419EN: "Gorilla's Jungle Groove Jam", IX420EN: "Flamingo's Pink Dance Fiesta",
  IX421EN: "Shark's Ocean Rave Party", IX422EN: "Bloop-Bloop's Giggly Night Parade", IX423EN: "Puppy Bella's Birthday Bash",
  IX424EN: "Pixie's Doggy Praise Party", IX425EN: "Lamb's Leaping Festival Dance", IX426EN: "Badger's Boogie Blunder Bash",
  IX427EN: "Bat's Upside-Down Beat Bash", IX428EN: "Moose's Mambo Mix-Up", IX429EN: "Fireflies' Glowing Garden Party",
  IX430EN: "Donkey Nala's Humble Journey", TTX301: "Penguin's Icy Waddle Palooza", TTX302: "Puppy's Bouncy Paw-ty",
  TTX303: "Fluffy's Salsa Fiesta", TTX304: "Bunny's Hoppy Thump Bash", TTX305: "Koala's Karaoke Cuddle Night",
  TTX306: "Octopus' Bubbly Disco Splash", TTX307: "Llama's Leaping Hallelujah Fiesta", TTX308: "Turtle's Slow Shell Party",
  TTX309: "Kitty's Cozy Pajama Jam",
};

// Batch 8 (tiny-tiggles tail + general + Romanian)
const B8 = {
  TTX311: "Sloth's Sleepy Sing Party", TTX313: "Otter's Splashy Praise Party", TTX314: "Giraffe's Sky-High Groove",
  TTX315: "Duck's Bluegrass Pond Party", TTX316: "Seal's Splashing Song Serenade", TTX317: "Zebra's Jungle Zing Party",
  TTX318: "Raccoon's Glowing Night Rave", TTX319: "Hedgehog's Bouncy Hop Party", TTX320: "Snail's Slow-Dance Samba",
  TTX321: "Donkey's Drumbeat Jam", TTX323: "Turkey's Two-Step Shindig", TTX324: "Beaver's Beatbox Build Party",
  TTX325: "Leopard's Lullaby Lounge Party", TTX326: "Wombat's Wiggly Worship Party", TTX327: "Caterpillar's Wiggling Cha-Cha",
  TTX328: "Bear's Boppin' Bash", TTX329: "Skunk's Stinky Celebration", TTX330: "Chinchilla's Cha-Cha Party",
  TTX331: "Hippo's Mudslide Splash Party", TTX332: "Ladybug's Flourishing Garden Party",
  IMX503ah: "Vietnam Soldier's Guilt Reckoning", IMX504ah: 'Vietnam War Broadway Drama', IMX506: 'Wildflower Country Soul',
  IX500EN: 'Patriotic Country Anthems', IX502EN: 'Country Heartbreak and Romance',
  IX401RO: "Rooster's Party Praise", IX402RO: "Pug's Carnival Bash", IX403RO: "Alligator's Jazz Parade",
  IX405RO: 'Royal Peacock Parade', IX418RO: "Dolphin's Tropical Luau", IX423RO: "Bella's Birthday Bash",
  IX424RO: "Pixie's Party Celebration", IX425RO: "Lamb's Festive Dance",
};

// Merge: agents first, then SEED overrides on overlap.
const merged = { ...B1, ...B2, ...B3, ...B4, ...B5, ...B6, ...B7, ...B8, ...SEED };

// Enforce the 5-word-max rule; report any violation (hyphenated compounds count as 1 word).
const wc = (s) => s.trim().split(/\s+/).length;
const tooLong = Object.entries(merged).filter(([, v]) => wc(v) > 5);
if (tooLong.length) {
  console.error('OVER 5 WORDS:'); tooLong.forEach(([k, v]) => console.error(`  ${k}: "${v}" (${wc(v)})`));
}

// Sort keys for a stable, readable file.
const themes = {};
for (const k of Object.keys(merged).sort()) themes[k] = merged[k];

const payload = {
  note: "Per-album one-line theme (1-5 words, Title Case) summarizing what the album is ABOUT (not a genre). Derived per album from its lyrics/blueprint by the theme-analysis agents; the 13 SEED entries are hand-crafted. Shown as the 3rd item on the popup card's third line (after the secondary genre, with a ·).",
  themes,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${Object.keys(themes).length} themes -> ${OUT}`);
