'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabDef {
  id: string;
  label: string;
  panel: ReactNode;
}

/** Roving-tabindex tablist. Arrow keys move; the panel fades in on change. */
export function Tabs({ tabs, className }: { tabs: TabDef[]; className?: string }) {
  const baseId = useId();
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setSelected(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusTab(selected + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusTab(selected - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusTab(tabs.length - 1);
    }
  };

  return (
    <div className={className}>
      <div className={styles.list} role="tablist" aria-label="Album detail" onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-controls={`${baseId}-panel-${tab.id}`}
            aria-selected={i === selected}
            tabIndex={i === selected ? 0 : -1}
            className={[styles.tab, i === selected ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => setSelected(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/*
        Every panel is rendered and the inactive ones are `hidden`, rather than
        unmounted. The Derivation is the platform's evidence — it must exist in
        the server-rendered HTML where a crawler, a reader-mode, or a sceptic
        with "view source" can find it, not appear only after a click.
      */}
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          className={styles.panel}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          tabIndex={0}
          hidden={i !== selected}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
