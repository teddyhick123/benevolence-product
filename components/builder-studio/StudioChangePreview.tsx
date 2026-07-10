interface StudioChangePreviewProps {
  title: string;
  changes: Array<{ label: string; before: string; after: string }>;
}

export default function StudioChangePreview({ title, changes }: StudioChangePreviewProps) {
  if (changes.length === 0) return null;

  return <div className="rounded-md border border-azure/20 bg-azure/5 p-3">
    <div className="text-xs font-semibold text-azure">{title}</div>
    <div className="mt-2 space-y-2">
      {changes.map((change) => <div key={change.label} className="grid gap-1 text-xs sm:grid-cols-[8rem_1fr_1fr] sm:gap-2">
        <span className="font-medium text-neutral-600">{change.label}</span>
        <span className="rounded bg-white px-2 py-1 text-neutral-500 line-through">{change.before}</span>
        <span className="rounded border border-azure/20 bg-white px-2 py-1 text-neutral-800">{change.after}</span>
      </div>)}
    </div>
  </div>;
}
