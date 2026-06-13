import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Validates request body against a Zod schema
 * Returns validated data or error response
 */
export async function validateRequest<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<{ success: true; data: z.infer<T> } | { success: false; response: NextResponse }> {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'Validation failed',
            details: result.error.format(),
          },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        ),
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }
}

