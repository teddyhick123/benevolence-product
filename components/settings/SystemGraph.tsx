// components/settings/SystemGraph.tsx
'use client';

interface SystemGraphProps {
  modules: Record<string, boolean>;
  teamCount: number;
  portfolioCount: number;
  orgName: string;
}

interface GraphNode {
  id: string;
  label: string;
  sublabel?: string;
  active: boolean;
  angle: number; // degrees from top
}

const MODULE_LABELS: Record<string, string> = {
  tax: 'Tax Center',
  donors: 'Donor CRM',
  compliance: 'Compliance',
  quickbooks: 'QuickBooks',
};

function polarToXY(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

export default function SystemGraph({
  modules,
  teamCount,
  portfolioCount,
  orgName,
}: SystemGraphProps) {
  const cx = 200;
  const cy = 200;
  const radius = 130;

  const moduleKeys = ['tax', 'donors', 'compliance', 'quickbooks'];
  const moduleNodes: GraphNode[] = moduleKeys.map((key, i) => ({
    id: key,
    label: MODULE_LABELS[key],
    active: !!modules[key],
    angle: 30 + (i / moduleKeys.length) * 360,
  }));

  const outerNodes: GraphNode[] = [
    {
      id: 'team',
      label: 'Team',
      sublabel: `${teamCount} member${teamCount !== 1 ? 's' : ''}`,
      active: teamCount > 0,
      angle: 270,
    },
    {
      id: 'portfolios',
      label: 'Portfolios',
      sublabel: `${portfolioCount} active`,
      active: portfolioCount > 0,
      angle: 315,
    },
  ];

  const allNodes = [...moduleNodes, ...outerNodes];

  return (
    <div className="relative w-full" style={{ aspectRatio: '1 / 1', maxWidth: 400 }}>
      <svg viewBox="0 0 400 400" className="w-full h-full">
        {/* Edges from center to each node */}
        {allNodes.map(node => {
          const pos = polarToXY(cx, cy, radius, node.angle);
          return (
            <line
              key={`edge-${node.id}`}
              x1={cx}
              y1={cy}
              x2={pos.x}
              y2={pos.y}
              stroke={node.active ? '#1a56db' : '#d1d5db'}
              strokeWidth={1.5}
              strokeDasharray={node.active ? undefined : '4 3'}
            />
          );
        })}

        {/* Outer nodes */}
        {allNodes.map(node => {
          const pos = polarToXY(cx, cy, radius, node.angle);
          const fill = node.active ? '#dbeafe' : '#f3f4f6';
          const stroke = node.active ? '#1a56db' : '#9ca3af';
          const textColor = node.active ? '#1e40af' : '#6b7280';

          return (
            <g key={node.id}>
              <circle cx={pos.x} cy={pos.y} r={30} fill={fill} stroke={stroke} strokeWidth={1.5} />
              <text
                x={pos.x}
                y={node.sublabel ? pos.y - 5 : pos.y + 4}
                textAnchor="middle"
                fontSize={9}
                fontWeight="600"
                fill={textColor}
              >
                {node.label}
              </text>
              {node.sublabel && (
                <text
                  x={pos.x}
                  y={pos.y + 8}
                  textAnchor="middle"
                  fontSize={8}
                  fill={textColor}
                >
                  {node.sublabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Center org node */}
        <circle cx={cx} cy={cy} r={40} fill="#1e3a5f" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={9} fontWeight="700" fill="white">
          {orgName.length > 14 ? orgName.slice(0, 13) + '…' : orgName}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8} fill="#93c5fd">
          Organization
        </text>
      </svg>

      {/* Legend */}
      <div className="flex gap-4 justify-center mt-2 text-xs text-black/50">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-100 border border-blue-500 inline-block" />
          Active
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-gray-100 border border-gray-400 inline-block" />
          Inactive
        </span>
      </div>
    </div>
  );
}
