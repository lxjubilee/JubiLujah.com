// Floating gold particles for the auth screens (matches JubileeInspire's motif).
const SPEC = [
  { left: '8%', size: 30, delay: '0s', dur: '24s' },
  { left: '22%', size: 46, delay: '4s', dur: '30s' },
  { left: '40%', size: 24, delay: '9s', dur: '22s' },
  { left: '58%', size: 52, delay: '2s', dur: '28s' },
  { left: '74%', size: 32, delay: '12s', dur: '26s' },
  { left: '90%', size: 40, delay: '6s', dur: '32s' },
];

export default function AuthParticles() {
  return (
    <div className="auth-particles" aria-hidden="true">
      {SPEC.map((p, i) => (
        <span key={i} className="auth-particle"
          style={{ left: p.left, width: p.size, height: p.size, animationDelay: p.delay, animationDuration: p.dur }} />
      ))}
    </div>
  );
}
