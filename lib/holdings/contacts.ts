import type { SessionClient } from '@/lib/api/server-client';
import type { Database } from '@/lib/database.types';

type HoldingContactRow = Database['public']['Tables']['holding_contacts']['Row'];

export type PrimaryHoldingContactPatch = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  organization?: string | null;
  photoPath?: string | null;
  notes?: string | null;
};

export async function getPrimaryHoldingContact(
  db: SessionClient,
  holdingId: string
): Promise<HoldingContactRow | null> {
  const { data, error } = await db
    .from('holding_contacts')
    .select('*')
    .eq('holding_id', holdingId)
    .eq('is_primary', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function hasIdentity(contact: Pick<HoldingContactRow, 'name' | 'email' | 'phone' | 'photo_path' | 'notes'>) {
  return Boolean(contact.name || contact.email || contact.phone || contact.photo_path || contact.notes);
}

export async function upsertPrimaryHoldingContact(
  db: SessionClient,
  holdingId: string,
  patch: PrimaryHoldingContactPatch
): Promise<HoldingContactRow | null> {
  const existing = await getPrimaryHoldingContact(db, holdingId);
  const next = {
    name: patch.name === undefined ? existing?.name ?? null : patch.name,
    email: patch.email === undefined ? existing?.email ?? null : patch.email,
    phone: patch.phone === undefined ? existing?.phone ?? null : patch.phone,
    role: patch.role === undefined ? existing?.role ?? null : patch.role,
    organization: patch.organization === undefined ? existing?.organization ?? null : patch.organization,
    photo_path: patch.photoPath === undefined ? existing?.photo_path ?? null : patch.photoPath,
    notes: patch.notes === undefined ? existing?.notes ?? null : patch.notes,
  };

  if (!hasIdentity(next)) {
    if (existing) {
      const { error } = await db.from('holding_contacts').delete().eq('id', existing.id);
      if (error) throw error;
    }
    return null;
  }

  if (existing) {
    const { data, error } = await db
      .from('holding_contacts')
      .update(next)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db
    .from('holding_contacts')
    .insert({ holding_id: holdingId, is_primary: true, ...next })
    .select('*')
    .single();

  if (!error) return data;
  if (error.code !== '23505') throw error;

  const concurrent = await getPrimaryHoldingContact(db, holdingId);
  if (!concurrent) throw error;
  const { data: updated, error: updateError } = await db
    .from('holding_contacts')
    .update(next)
    .eq('id', concurrent.id)
    .select('*')
    .single();
  if (updateError) throw updateError;
  return updated;
}
