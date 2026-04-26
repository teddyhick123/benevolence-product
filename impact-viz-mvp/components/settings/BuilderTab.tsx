// components/settings/BuilderTab.tsx
import SystemGraph from './SystemGraph';
import BuilderChat, { StoredMessage } from './BuilderChat';
import { OrgSnapshot } from '@/lib/builder/context-bundle';

interface BuilderTabProps {
  snapshot: OrgSnapshot;
  initialMessages: StoredMessage[];
}

export default function BuilderTab({ snapshot, initialMessages }: BuilderTabProps) {
  return (
    <div className="flex gap-6 h-[calc(100vh-280px)] min-h-[500px]">
      {/* Left: System visualization */}
      <div className="w-[40%] flex flex-col items-center justify-start pt-4 bg-white border border-black/10 rounded-xl p-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-black/50 uppercase tracking-wide mb-4">
          System Overview
        </h2>
        <SystemGraph
          modules={snapshot.modules}
          teamCount={snapshot.teamCount}
          portfolioCount={snapshot.portfolioCount}
          orgName={snapshot.name}
        />
        <div className="mt-6 w-full space-y-2 text-xs text-black/60">
          <div className="flex justify-between border-b border-black/5 pb-1">
            <span>Org type</span>
            <span className="font-medium capitalize">{snapshot.orgType.replace(/_/g, ' ')}</span>
          </div>
          <div className="flex justify-between border-b border-black/5 pb-1">
            <span>Team members</span>
            <span className="font-medium">{snapshot.teamCount}</span>
          </div>
          <div className="flex justify-between border-b border-black/5 pb-1">
            <span>Portfolios</span>
            <span className="font-medium">{snapshot.portfolioCount}</span>
          </div>
          <div className="flex justify-between pb-1">
            <span>Active KPIs</span>
            <span className="font-medium">{snapshot.metricCount}</span>
          </div>
        </div>
      </div>

      {/* Right: Builder chat */}
      <div className="flex-1 flex flex-col bg-white border border-black/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-black/10 flex items-center gap-2">
          <span className="text-sm font-semibold">Builder</span>
          <span className="text-xs text-black/40">AI-powered instance customization</span>
        </div>
        <BuilderChat orgId={snapshot.orgId} initialMessages={initialMessages} />
      </div>
    </div>
  );
}
