import type { ReactNode } from 'react';

interface EyebrowProps {
  children: ReactNode;
  /** The 6px glowing gold dot. On by default. */
  dot?: boolean;
  as?: 'p' | 'span' | 'div';
  className?: string;
}

/** Mono, 11px, .3em tracking, uppercase, starlight gold at 85%. */
export function Eyebrow({ children, dot = true, as: Tag = 'p', className }: EyebrowProps) {
  return (
    <Tag className={['eyebrow', dot ? 'eyebrow--dot' : '', className].filter(Boolean).join(' ')}>{children}</Tag>
  );
}
