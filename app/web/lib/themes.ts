// The top 12 faith-based worship themes used to organize the Home page.
// Displayed in this order (roughly by demand/frequency).
export interface Theme { key: string; label: string; }

export const THEMES: Theme[] = [
  { key: 'faithfulness', label: "God's Faithfulness & Trustworthiness" },
  { key: 'surrender', label: 'Surrender & Total Devotion' },
  { key: 'praise', label: 'Praise, Adoration & Worthiness' },
  { key: 'grace', label: 'Grace, Mercy & Forgiveness' },
  { key: 'victory', label: 'Victory, Breakthrough & Overcoming' },
  { key: 'hope', label: 'Hope & the Promise of a Better Future' },
  { key: 'cross', label: 'The Cross, Sacrifice & Redemption' },
  { key: 'love', label: "God's Unconditional Love & Intimacy" },
  { key: 'healing', label: 'Healing & Restoration' },
  { key: 'identity', label: 'Identity in Christ' },
  { key: 'thanksgiving', label: 'Thanksgiving & Gratitude' },
  { key: 'presence', label: 'Presence, Encounter & the Holy Spirit' },
];

// Title-based classifier. Each album lands in exactly ONE theme — the first rule
// (in priority order) whose keywords match the album title. Unmatched titles
// fall back to "faithfulness" (the broadest / most-sung theme). This is a
// heuristic best-fit by title; refine the keyword rules to retune placements.
const RULES: { key: string; re: RegExp }[] = [
  // Cross / resurrection / redemption — strongest gospel-core signals first.
  { key: 'cross', re: /\b(cross|calvary|blood|resurrection|risen|easter|redeem\w*|redempt\w*|sacrifice|crucif\w*|gospel|salvation|saved|ransom|rescue|lamb|empty tomb|finished|cradle|manger|incarnat\w*)\b/i },
  // Healing & restoration (incl. the sickness / waiting-room narrative).
  { key: 'healing', re: /\b(heal\w*|mend|restore\w*|restoration|whole|wounds?|broken|stream|doctor|waiting room|recover\w*|coming back|made new)\b/i },
  // Victory / breakthrough / overcoming / spiritual battle / rising up.
  { key: 'victory', re: /\b(victory|breakthrough|overcom\w*|conquer\w*|chains?|freedom|set free|deliver\w*|battle|war|warrior|strong|stand\w*|justice|outlaw|shout|power|burn|line holds|courage|conviction|rise|rises|rising|revolution|earthquake|quake|babel|undone|splits? open|aftershock\w*)\b/i },
  // Grace / mercy / forgiveness / repentance.
  { key: 'grace', re: /\b(grace|mercy|merciful|forgive\w*|repent\w*|washed|clean|prodigal|undeserved|unworthy|kindness)\b/i },
  // Presence / encounter / Holy Spirit / fire / revival / the silence & seeking.
  { key: 'presence', re: /\b(presence|spirit|pentecost|holy ghost|fire|flame|awaken\w*|revival|encounter|fill this|come holy|dwell|outpouring|wind|here|seer|dream\w*|midnight|silence|thin places|night he came)\b/i },
  // Surrender / total devotion / altar / throne of the heart.
  { key: 'surrender', re: /\b(surrender|yield|altar|i bow|bow|knees|throne of my heart|lay (it|them|me) down|all to (you|jesus)|wholly|consecrat\w*|devotion|abandon)\b/i },
  // Unconditional love & intimacy / Father heart.
  { key: 'love', re: /\b(love|loved|beloved|fathers?|father'?s|good good|reckless|intimacy|embrace|tender|affection|adopt\w*|child of|mothers?|daughters and mothers)\b/i },
  // Identity in Christ / belonging / chosen / calling / wisdom & lineage.
  { key: 'identity', re: /\b(identity|chosen|called|calling|belong\w*|named|the name|only name|sent ones?|apostle|apostolic|prophet\w*|witness|ambassador|royal|heir|wisdom|leadership|lineage|stewardship|authority|ancestral|sons|daughters|women)\b/i },
  // Hope & better future / new creation / eternity / restoration of all things.
  { key: 'hope', re: /\b(hope|dawn|sunrise|morning|tomorrow|future|joy comes|new day|light|horizon|eternal|forever|heaven\w*|new earth|zion|beulah|restored|return\w*|millennium|marriage supper|longing|lament)\b/i },
  // Thanksgiving & gratitude / celebration / gathering / homecoming / the nations feast.
  { key: 'thanksgiving', re: /\b(thank\w*|grateful|gratitude|blessing|blessed|celebrate\w*|rejoice|gather\w*|together|reunion|home\w*|full circle|harvest|feast|dance|joy|jubilee|table|community|nations)\b/i },
  // Praise / adoration / worthiness / kingship / glory.
  { key: 'praise', re: /\b(praise|adore|adoration|worship|worthy|holy|glor\w*|majesty|exalt\w*|hallelujah|king|reigns?|throne|lord|hosanna|crown|kingdom|savior|millennium begins|rey|ritmo)\b/i },
  // Faithfulness / trustworthiness / heritage — also the catch-all fallback.
  { key: 'faithfulness', re: /\b(faithful\w*|covenant|trust\w*|never fail|constant|promise|anchor|refuge|rock|steadfast|seasons?|legacy|generation\w*|heritage|roots|faith|keeper|remains|story|stories)\b/i },
];

export function classifyTheme(title: string): string {
  const t = title || '';
  for (const r of RULES) if (r.re.test(t)) return r.key;
  return 'faithfulness';
}
