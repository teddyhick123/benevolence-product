export default function TrefoilLoader({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Animated gradient that flows through the petals */}
        <linearGradient id="petal-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3">
            <animate attributeName="offset" values="-0.5;1.5" dur="2s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="currentColor" stopOpacity="1">
            <animate attributeName="offset" values="0;2" dur="2s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.3">
            <animate attributeName="offset" values="0.5;2.5" dur="2s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>

      <g transform="translate(50, 50)">
        {/* Top petal (0°) */}
        <path
          d="M 0,-15
             C -12,-15 -20,-25 -20,-35
             C -20,-45 -12,-50 0,-50
             C 12,-50 20,-45 20,-35
             C 20,-25 12,-15 0,-15 Z"
          fill="url(#petal-gradient)"
          opacity="0.9"
        />

        {/* Bottom left petal (120° rotation) */}
        <path
          d="M 0,-15
             C -12,-15 -20,-25 -20,-35
             C -20,-45 -12,-50 0,-50
             C 12,-50 20,-45 20,-35
             C 20,-25 12,-15 0,-15 Z"
          fill="url(#petal-gradient)"
          opacity="0.9"
          transform="rotate(120)"
        />

        {/* Bottom right petal (240° rotation) */}
        <path
          d="M 0,-15
             C -12,-15 -20,-25 -20,-35
             C -20,-45 -12,-50 0,-50
             C 12,-50 20,-45 20,-35
             C 20,-25 12,-15 0,-15 Z"
          fill="url(#petal-gradient)"
          opacity="0.9"
          transform="rotate(240)"
        />

        {/* Center circle */}
        <circle
          cx="0"
          cy="0"
          r="10"
          fill="currentColor"
          opacity="0.5"
        />
      </g>
    </svg>
  );
}
