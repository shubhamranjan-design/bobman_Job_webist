// Ambient background — gradient orbs + drifting particles only.

const particles = Array.from({ length: 14 }).map((_, i) => ({
  id: i,
  top: Math.round(Math.random() * 100),
  left: Math.round(Math.random() * 100),
  size: 2 + Math.round(Math.random() * 4),
  dx: -50 + Math.round(Math.random() * 100),
  dy: -50 + Math.round(Math.random() * 100),
  dur: 18 + Math.round(Math.random() * 30),
  delay: Math.round(Math.random() * 10),
}));

export default function AnimatedMesh() {
  return (
    <div className="bg-mesh" aria-hidden="true">
      {/* Soft gradient orbs */}
      <span className="bg-orb bg-orb-1" />
      <span className="bg-orb bg-orb-2" />
      <span className="bg-orb bg-orb-3" />
      <span className="bg-orb bg-orb-4" />

      {/* Floating particles — random drift */}
      <div className="bg-particles">
        {particles.map((p) => (
          <span
            key={p.id}
            className="bg-particle"
            style={{
              top: `${p.top}%`,
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.dur}s`,
              animationDelay: `-${p.delay}s`,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
            }}
          />
        ))}
      </div>

      {/* Texture grain */}
      <span className="bg-grain" />
    </div>
  );
}
