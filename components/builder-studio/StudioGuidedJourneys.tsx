'use client';

import { Compass, FileInput, LayoutDashboard, ListChecks, MessageSquareText, PlusSquare } from 'lucide-react';

const JOURNEYS = [
  { title: 'Design grant workflow', prompt: 'Help me design our grant workflow, including stages, required information, checklist gates, and approval notes.', icon: ListChecks },
  { title: 'Import historical data', prompt: 'Help me prepare to import our historical grants, donors, contributions, and holdings. Start by telling me what files and fields you need.', icon: FileInput },
  { title: 'Configure dashboard', prompt: 'Help me configure the main dashboard for our foundation. Ask what our staff should see first and propose the right sections and grant view.', icon: LayoutDashboard },
  { title: 'Set up board reporting', prompt: 'Help me create a board reporting template with the sections and cadence our trustees need.', icon: Compass },
  { title: 'Add custom fields', prompt: 'Help me identify and add the custom fields our foundation needs to make better grant decisions.', icon: PlusSquare },
  { title: 'Teach the AI our foundation', prompt: 'Help me capture the operating norms, vocabulary, and preferences the AI should remember about our foundation.', icon: MessageSquareText },
];

export default function StudioGuidedJourneys() {
  function start(prompt: string) {
    window.dispatchEvent(new CustomEvent('builder-studio:prompt', { detail: prompt }));
    document.getElementById('ask-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
    <div className="text-sm font-semibold text-neutral-800">Guided journeys</div>
    <p className="mt-1 text-sm text-neutral-500">Start with a clear outcome. Builder will turn it into a structured configuration conversation.</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{JOURNEYS.map((journey) => { const Icon = journey.icon; return <button key={journey.title} onClick={() => start(journey.prompt)} className="flex min-h-20 items-start gap-2 rounded-md border border-neutral-200 p-3 text-left transition hover:border-azure/40 hover:bg-azure/5"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-azure" /><span className="text-sm font-medium text-neutral-800">{journey.title}</span></button>; })}</div>
  </section>;
}
