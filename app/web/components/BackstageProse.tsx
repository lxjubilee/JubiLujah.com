import type { BackstageBlock } from '@/lib/backstage';

// Renders the compiled block list from lib/backstage. The source markdown uses
// only a small, fixed subset — paragraphs, `---` rules, blockquotes and inline
// **bold** / *italic* — so it is rendered as real React elements rather than
// injected HTML. Nothing here uses dangerouslySetInnerHTML.

/** Split inline **bold** / *italic* into elements. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${keyBase}-b${i}`}>{m[1]}</strong>);
    else out.push(<em key={`${keyBase}-i${i}`}>{m[2]}</em>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function BackstageInline({ text }: { text: string }) {
  return <>{inline(text, 'x')}</>;
}

export default function BackstageProse({
  blocks,
  className = 'bs-prose',
}: {
  blocks: BackstageBlock[];
  className?: string;
}) {
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        const key = `${b.type}-${i}`;
        if (b.type === 'hr') return <hr key={key} className="bs-rule" />;
        if (b.type === 'h2') return <h2 key={key}>{inline(b.text || '', key)}</h2>;
        if (b.type === 'h3') return <h3 key={key}>{inline(b.text || '', key)}</h3>;
        if (b.type === 'quote') return <blockquote key={key}>{inline(b.text || '', key)}</blockquote>;
        return <p key={key}>{inline(b.text || '', key)}</p>;
      })}
    </div>
  );
}
