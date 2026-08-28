import { Fragment, type ReactNode } from 'react';
import type { HebraicBlock } from '@/lib/torahsings/hebraic';
import styles from './BackstageProse.module.css';

/** Render the tiny inline markdown subset (**bold**, *italic*) as real nodes. */
function inline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    if (m[1] != null) nodes.push(<strong key={key++}>{m[1]}</strong>);
    else nodes.push(<em key={key++}>{m[2]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return nodes;
}

export function BackstageProse({
  blocks,
  imageResolver,
}: {
  blocks: HebraicBlock[];
  /** Resolves an inline image filename to a CDN URL, or null if not generated yet. */
  imageResolver?: (file: string | null | undefined) => string | null;
}) {
  return (
    <div className={styles.body}>
      {blocks.map((b, i) => {
        if (b.type === 'h') return <h2 key={i}>{inline(b.text ?? '')}</h2>;
        if (b.type === 'hr') return <hr key={i} className={styles.rule} />;
        if (b.type === 'image') {
          const url = imageResolver?.(b.src) ?? null;
          if (url) {
            return (
              <figure key={i} className={styles.figure}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.image} src={url} alt={b.alt ?? ''} loading="lazy" decoding="async" />
                {b.alt ? <figcaption className={styles.caption}>{b.alt}</figcaption> : null}
              </figure>
            );
          }
          return (
            <div key={i} className={styles.imagePending} role="img" aria-label={b.alt ?? 'Illustration coming soon'}>
              <span className={styles.pendingBadge}>Paleo-Hebrew infographic</span>
              {b.alt ? <span className={styles.pendingAlt}>{b.alt}</span> : null}
              <span className={styles.pendingNote}>image coming</span>
            </div>
          );
        }
        if (b.type === 'quote')
          return (
            <blockquote key={i}>
              {inline(b.text ?? '')}
              {b.cite ? <cite>{b.cite}</cite> : null}
            </blockquote>
          );
        return <p key={i}>{inline(b.text ?? '')}</p>;
      })}
    </div>
  );
}
