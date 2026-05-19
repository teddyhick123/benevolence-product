'use client';

import InlineTextArea from './ui/InlineTextArea';
import { useRouter } from 'next/navigation';

type EditableContactNotesProps = {
  holdingId: string;
  notes: string;
  updateAction: (holdingId: string, value: string) => Promise<void>;
};

export default function EditableContactNotes({ holdingId, notes, updateAction }: EditableContactNotesProps) {
  const router = useRouter();

  const handleSave = async (newValue: string) => {
    await updateAction(holdingId, newValue);
    router.refresh();
  };

  return (
    <div className="text-sm text-neutral-700">
      <InlineTextArea
        value={notes}
        onSave={handleSave}
        placeholder="Double-click to add notes about this contact"
        className="text-sm"
      />
    </div>
  );
}
