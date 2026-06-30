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
