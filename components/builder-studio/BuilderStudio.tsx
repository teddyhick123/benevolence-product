import { FileCode2, MessageSquareText } from 'lucide-react';
import WorkbenchHomePanel from '@/components/dashboard/WorkbenchHomePanel';
import BuilderTab from '@/components/settings/BuilderTab';
import StudioAccessPanel from './StudioAccessPanel';
import StudioCustomFieldsPanel from './StudioCustomFieldsPanel';
import StudioFoundationMemoryPanel from './StudioFoundationMemoryPanel';
import StudioGuidedJourneys from './StudioGuidedJourneys';
import StudioModulesPanel from './StudioModulesPanel';
import StudioProposalsPanel from './StudioProposalsPanel';
import StudioViewsPanel from './StudioViewsPanel';
import StudioWorkflowPanel from './StudioWorkflowPanel';
import type { StoredMessage } from '@/components/settings/BuilderChat';
import type { OrgSnapshot } from '@/lib/builder/context-bundle';

interface BuilderStudioProps {
  snapshot: OrgSnapshot;
  initialMessages: StoredMessage[];
  githubEnabled: boolean;
  canReviewImplementation: boolean;
}

export default function BuilderStudio({ snapshot, initialMessages, githubEnabled, canReviewImplementation }: BuilderStudioProps) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-medium text-azure">Builder Studio</div>
          <h1 className="mt-1 font-serif text-3xl text-neutral-950">Shape {snapshot.name}</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            Configure the foundation&apos;s modules, data, workflows, dashboards, reports, and AI behavior from one studio.
            The main dashboard remains the operating space your team uses day to day.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="#ask-builder"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-azure px-4 text-sm font-medium text-white shadow-sm transition hover:bg-azure/90"
          >
            <MessageSquareText className="h-4 w-4" />
            Ask Builder
          </a>
          <a
            href="#views"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            <FileCode2 className="h-4 w-4" />
            Configure Views
          </a>
        </div>
      </div>

      <section id="overview" className="scroll-mt-24">
        <WorkbenchHomePanel orgId={snapshot.orgId} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <StudioModulesPanel orgId={snapshot.orgId} />
        <StudioProposalsPanel
          orgId={snapshot.orgId}
          canReviewImplementation={canReviewImplementation}
        />
        <StudioAccessPanel orgId={snapshot.orgId} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <StudioViewsPanel orgId={snapshot.orgId} />
        <StudioWorkflowPanel orgId={snapshot.orgId} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <StudioCustomFieldsPanel orgId={snapshot.orgId} />
        <StudioFoundationMemoryPanel orgId={snapshot.orgId} />
      </div>

      <StudioGuidedJourneys />

      <section id="ask-builder" className="scroll-mt-24">
        <BuilderTab
          snapshot={snapshot}
          initialMessages={initialMessages}
          githubEnabled={githubEnabled}
          canReviewImplementation={canReviewImplementation}
        />
      </section>
    </div>
  );
}
