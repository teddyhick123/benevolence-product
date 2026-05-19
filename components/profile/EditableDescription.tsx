'use client';

import InlineTextArea from '@/components/ui/InlineTextArea';
import { useRouter } from 'next/navigation';

type EditableDescriptionProps = {
  holdingId: string;
  description: string;
  updateAction: (holdingId: string, value: string) => Promise<void>;
};

export default function EditableDescription({ holdingId, description, updateAction }: EditableDescriptionProps) {
  const router = useRouter();

  const handleSave = async (newValue: string) => {
    await updateAction(holdingId, newValue);
    router.refresh();
  };

  return (
    <div className="mt-3 prose prose-sm max-w-none text-neutral-800">
      <InlineTextArea value={description} onSave={handleSave} placeholder="Double-click to add description" />
    </div>
  );
}
