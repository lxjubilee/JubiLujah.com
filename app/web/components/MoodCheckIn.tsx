'use client';
// Mood check-in — spec §9. One lightweight, dismissible, non-blocking question
// on opening a playlist. The response biases assembly WITHIN the theme's
// boundaries (never overrides energy_range/excluded_moods). Private to the
// listener; re-asked at most once per local day (the parent stores + expires it).
const MOODS: { key: string; label: string }[] = [
  { key: 'celebrating', label: 'Celebrating' },
  { key: 'grateful', label: 'Grateful' },
  { key: 'hopeful', label: 'Hopeful' },
  { key: 'seeking', label: 'Seeking' },
  { key: 'weary', label: 'Weary' },
  { key: 'heavy', label: 'Carrying something heavy' },
];

export default function MoodCheckIn({ onPick, onDismiss }: { onPick: (mood: string) => void; onDismiss: () => void }) {
  return (
    <div className="tpl-mood-scrim" role="dialog" aria-label="How are you arriving today?">
      <div className="tpl-mood">
        <button type="button" className="tpl-mood-x" aria-label="Dismiss" onClick={onDismiss}>×</button>
        <h3 className="tpl-mood-q">How are you arriving today?</h3>
        <p className="tpl-mood-sub">This just shapes the mix a little. It stays between us.</p>
        <div className="tpl-mood-opts">
          {MOODS.map((m) => (
            <button key={m.key} type="button" className="tpl-mood-opt" onClick={() => onPick(m.key)}>{m.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
