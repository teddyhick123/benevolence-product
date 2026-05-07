import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

const getSupabase = createSupabaseServerClient;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;

  // Auth check
  const supabaseAuth = await getSupabase();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('photo') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate file type
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 });
  }

  const supabase = await getSupabase();

  try {
    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${holdingId}-${Date.now()}.${fileExt}`;
    const filePath = `contact-photos/${fileName}`;

    // Convert File to ArrayBuffer then to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('holdings')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Generate signed URL (1 hour expiry) — bucket is private
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('holdings')
      .createSignedUrl(filePath, 3600);

    if (signedUrlError || !signedUrlData) {
      return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 });
    }

    const photoUrl = signedUrlData.signedUrl;

    // Update holding with photo URL
    const { error: updateError, data: updateData } = await supabase
      .from('holdings')
      .update({ primary_contact_photo: photoUrl })
      .eq('id', holdingId)
      .select();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    revalidatePath(`/dashboard/holdings/${holdingId}`);
    revalidatePath(`/dashboard`);

    return NextResponse.json({ photoUrl, updated: updateData });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}