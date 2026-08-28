import type { Block } from '@/lib/torahsings/types';

/** Renders a rich-text body. The pull-quote is the only ornamented block. */
export function ArticleBody({ blocks, className }: { blocks: Block[]; className?: string }) {
  return (
    <div className={['prose', className].filter(Boolean).join(' ')}>
      {blocks.map((block, i) => {
        if (block.type === 'h') return <h3 key={i}>{block.text}</h3>;
        if (block.type === 'quote') {
          return (
            <blockquote key={i}>
              {block.text}
              <cite>{block.cite}</cite>
            </blockquote>
          );
        }
        return <p key={i}>{block.text}</p>;
      })}
    </div>
  );
}
