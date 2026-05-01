// Harmonograph bundle loader — 18 rotated copies of a 5-2-4 hypotrochoid,
// pulsing in unison. Matches design position #5 ("Logo C: synchronized pulse").

const PATH_LENGTH = 779;
const N_PATHS = 18;
const SPREAD_DEG = 37.4; // ±18.7° rotation spread across copies

function buildHypotrochoidPath(): string {
  // 5-2-4 hypotrochoid: R=5, r=2, d=4, scale=9.71 → path length ≈ 779
  const scale = 9.71;
  const steps = 720;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 4 * Math.PI;
    const x = (3 * Math.cos(t) + 4 * Math.cos(1.5 * t)) * scale;
    const y = (3 * Math.sin(t) - 4 * Math.sin(1.5 * t)) * scale;
    parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return parts.join(' ');
}

const BASE_PATH = buildHypotrochoidPath();

const ANGLES = Array.from({ length: N_PATHS }, (_, i) =>
  -SPREAD_DEG / 2 + (i / (N_PATHS - 1)) * SPREAD_DEG
);

export default function TrefoilLoader({ className = 'h-16 w-16' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="-85 -85 170 170"
      xmlns="http://www.w3.org/2000/svg"
    >
      {ANGLES.map((angle, i) => (
        <path
          key={i}
          className="logo-bundle-pulse"
          d={BASE_PATH}
          fill="none"
          stroke="#5186A6"
          strokeWidth="0.7"
          strokeDasharray={`${PATH_LENGTH} ${PATH_LENGTH}`}
          transform={`rotate(${angle.toFixed(2)})`}
        />
      ))}
    </svg>
  );
}
