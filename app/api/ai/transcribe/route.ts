import { NextRequest, NextResponse } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
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
  const access = await requireUserAccess();
  if (isAccessDenied(access)) {
    return access.reason === 'unauthenticated' ? aiAuthRequired() : access.response;
  }

  try {
    // Parse multipart form data
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const text = await transcribeAudio(audioFile, {
      kind: 'platform',
      actorId: access.context.user.id,
    });

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
