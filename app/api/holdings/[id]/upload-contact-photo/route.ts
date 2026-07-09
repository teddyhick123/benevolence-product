import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

const getSupabase = createSupabaseServerClient;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init?.headers ?? {}),
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;

  // Auth check
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: holding, error: holdingError } = await supabase
    .from('holdings')
    .select('portfolio_id')
    .eq('id', holdingId)
    .single();

  if (holdingError || !holding) {
    return json({ error: 'Holding not found' }, { status: 404 });
  }

  const { data: canEdit, error: canEditErr } = await supabase.rpc('can_edit_portfolio', {
    p_portfolio_id: holding.portfolio_id,
  });

  if (canEditErr || !canEdit) {
    return json({ error: 'not authorized' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('photo') as File;

  if (!file) {
    return json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate file type
  if (!file.type.startsWith('image/')) {
    return json({ error: 'File must be an image' }, { status: 400 });
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    return json({ error: 'File size must be less than 5MB' }, { status: 400 });
  }

  try {
    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${holdingId}-${Date.now()}.${fileExt}`;
    const filePath = `contact-photos/${fileName}`;

    // Convert File to ArrayBuffer then to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('holdings')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return json({ error: uploadError.message }, { status: 500 });
    }

    // Generate signed URL (1 hour expiry) — bucket is private
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('holdings')
      .createSignedUrl(filePath, 3600);

    if (signedUrlError || !signedUrlData) {
      await supabase.storage.from('holdings').remove([filePath]);
      return json({ error: 'Failed to generate signed URL' }, { status: 500 });
    }

    const photoUrl = signedUrlData.signedUrl;

    // Store the stable private storage path, and return a fresh signed URL for immediate display.
    const { error: updateError, data: updateData } = await supabase
      .from('holdings')
      .update({ primary_contact_photo: filePath })
      .eq('id', holdingId)
      .eq('portfolio_id', holding.portfolio_id)
      .select();

    if (updateError) {
      await supabase.storage.from('holdings').remove([filePath]);
      return json({ error: updateError.message }, { status: 500 });
    }

    revalidatePath(`/dashboard/holdings/${holdingId}`);
    revalidatePath(`/dashboard`);

    return json({ photoUrl, storagePath: filePath, updated: updateData });
  } catch (error) {
    return json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
