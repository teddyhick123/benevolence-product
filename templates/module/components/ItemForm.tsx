'use client';

import { useState } from 'react';

interface Props {
  itemId: string | null;
  onSave: (input: { name: string }) => Promise<void>;
}

export default function {ModuleName}ItemForm({ itemId, onSave }: Props) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSave({ name: name.trim() });
      setName('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : itemId ? 'Save changes' : 'Create item'}
      </button>
    </form>
  );
}
