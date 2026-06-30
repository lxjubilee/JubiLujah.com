// Decorative animated particles flourish (server component, matches site.css).
const SPEC = [
  { left: '8%', delay: '0s', cls: '' }, { left: '18%', delay: '2s', cls: 'gold' },
  { left: '27%', delay: '4s', cls: 'peach' }, { left: '38%', delay: '1s', cls: '' },
  { left: '48%', delay: '3s', cls: 'gold' }, { left: '58%', delay: '5s', cls: '' },
  { left: '68%', delay: '2.5s', cls: 'peach' }, { left: '78%', delay: '4.5s', cls: 'gold' },
  { left: '88%', delay: '1.5s', cls: '' },
];

export default function Particles() {
  return (
    <div className="particles" aria-hidden="true">
      {SPEC.map((s, i) => (
        <div key={i} className={`particle ${s.cls}`} style={{ left: s.left, animationDelay: s.delay }} />
      ))}
    </div>
  );
}
