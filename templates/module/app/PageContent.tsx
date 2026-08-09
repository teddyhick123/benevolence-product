'use client';

import { useState } from 'react';
import {ModuleName}ItemForm from '@/components/{module_name}/ItemForm';
import {ModuleName}ItemList from '@/components/{module_name}/ItemList';
import { save{ModuleName}Item, use{ModuleName}Items } from '@/lib/{module_name}/hooks';

interface Props {
  orgId: string;
}

export default function {ModuleName}PageContent({ orgId }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { items, error, isLoading, mutate } = use{ModuleName}Items(orgId);

  async function handleSave(input: { name: string }) {
    await save{ModuleName}Item(orgId, editingId, input);
    setEditingId(null);
    await mutate();
  }

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p role="alert">{error.message}</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <{ModuleName}ItemList items={items} onEdit={setEditingId} />
      <{ModuleName}ItemForm itemId={editingId} onSave={handleSave} />
    </div>
  );
}
