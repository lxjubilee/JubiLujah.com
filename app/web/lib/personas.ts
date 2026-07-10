// Persona avatar art lives in /public/personas/<FirstName>.png for the Inspire
// Family personas. Other artists (faith-based, general, children) have no photo
// and fall back to the colored gradient + name label defined in site.css.
const HAS_IMAGE = new Set([
  'amir', 'caleb', 'eliana', 'elias', 'imani', 'jubilee',
  'melody', 'nova', 'santiago', 'tahoma', 'zariah', 'zev',
]);

// Collaborative projects listed under "inspire" in the manifest that are NOT
// individual personas — excluded from the Inspire Family persona lists.
export const NON_PERSONAS = new Set(['kingdom-pulse', 'radiant-stones']);
export const isPersona = (slug: string) => !NON_PERSONAS.has(slug);

// The 12 Inspire Family personas in birth order. Shared source of truth for the
// Inspire page and the Home "Featured Artists" strip. Gabriel Inspire is omitted
// (excluded from browse), as are the NON_PERSONAS collab projects.
export const INSPIRE_ORDER = [
  'jubilee-inspire', 'melody-inspire', 'zariah-inspire', 'elias-inspire',
  'eliana-inspire', 'caleb-inspire', 'imani-inspire', 'zev-inspire',
  'amir-inspire', 'nova-inspire', 'santiago-inspire', 'tahoma-inspire',
];

// e.g. "imani-inspire" -> "imani"
export function avatarKey(slug: string): string {
  return slug.split('-')[0].toLowerCase();
}

// e.g. "imani-inspire" -> "/personas/Imani.png" (or null if no art exists)
export function personaImage(slug: string): string | null {
  const key = avatarKey(slug);
  if (!HAS_IMAGE.has(key)) return null;
  return `/personas/${key.charAt(0).toUpperCase()}${key.slice(1)}.png`;
}

// Stylized "Jubilee-Persona" card art in /public/Jubilee-Persona/Jubilee-<Name>.png
// — a second art set for the same 12 Inspire personas (Jubilee's own card is
// Jubilee-Inspire.png). This is the canonical persona imagery across the site
// (Home Featured Artists, Search, category grids). Returns null for non-persona
// artists so callers fall back to the gradient, exactly like personaImage().
export function personaCardImage(slug: string): string | null {
  const key = avatarKey(slug);
  if (!HAS_IMAGE.has(key)) return null;
  const name = key === 'jubilee' ? 'Inspire' : `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return `/Jubilee-Persona/Jubilee-${name}.png`;
}
