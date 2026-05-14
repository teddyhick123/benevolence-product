import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { aiAuthRequired } from '@/lib/rate-limit-response';
import { transcribeAudio } from '@/lib/ai/transcription';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/ai/transcribe
 * Transcribe audio to text using the configured transcription provider.
 * REQUIRES AUTHENTICATION - No anonymous AI access allowed
 */
export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    // Block anonymous access to AI features
    if (!user) {
      return aiAuthRequired();
    }

    // Parse multipart form data
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const text = await transcribeAudio(audioFile);

    return NextResponse.json({
      text,
      success: true,
    });

  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || 'Transcription failed',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
