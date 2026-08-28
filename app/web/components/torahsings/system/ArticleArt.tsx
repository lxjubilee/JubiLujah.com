import { articleImageUrl } from '@/lib/torahsings/article-art';
import { CelestialArt } from './CelestialArt';

/**
 * The art at the top of an article card / reader. Prefers the generated hero
 * image (from tools/ArticleImageStudio, served off the CDN) when one exists for
 * the slug, and otherwise falls back to the procedural CelestialArt placeholder
 * — so an article without a rendered image still looks intentional.
 */
interface ArticleArtProps {
  slug: string;
  hue: number;
  glyph: string;
  topic: string;
  ratio: string;
  className?: string;
}

export function ArticleArt({ slug, hue, glyph, topic, ratio, className }: ArticleArtProps) {
  const url = articleImageUrl(slug);
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- CDN host isn't configured for next/image; the album covers use plain <img> for the same reason.
      <img
        className={className}
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ width: '100%', aspectRatio: ratio, objectFit: 'cover', display: 'block' }}
      />
    );
  }
  return <CelestialArt className={className} seed={slug} hue={hue} topic={topic} glyph={glyph} ratio={ratio} />;
}
