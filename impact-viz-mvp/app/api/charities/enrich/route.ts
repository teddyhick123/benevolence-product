import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { getCharityNavigatorRating, transformCharityNavigatorRating } from '@/lib/services/charity-navigator';
import { getCandidSeal, transformCandidSeal } from '@/lib/services/candid';

/**
 * POST /api/charities/enrich
 * Enrich charities with ratings from external APIs
 *
 * Body:
 * - ein: Specific EIN to enrich (optional)
 * - limit: Number of charities to enrich (default: 10, max: 100)
 * - providers: Array of providers to use ['charity_navigator', 'candid'] (default: both)
 */
export async function POST(req: Request) {
  const adminClient = createAdminClient();

  try {
    const body = await req.json();
    const { ein, limit = 10, providers = ['charity_navigator', 'candid'] } = body;

    let enriched = 0;
    let errors = 0;
    const results: any[] = [];

    // If specific EIN provided, enrich just that one
    if (ein) {
      const { data: charity } = await adminClient
        .from('charities')
        .select('id, ein, name')
        .eq('ein', ein)
        .maybeSingle();

      if (!charity) {
        return NextResponse.json(
          { error: 'Charity not found' },
          { status: 404 }
        );
      }

      const result = await enrichCharity(charity, providers);
      return NextResponse.json({
        success: true,
        charity: result,
      });
    }

    // Otherwise, enrich multiple charities that haven't been enriched yet
    const { data: charities, error: fetchError } = await adminClient
      .from('charities')
      .select('id, ein, name')
      .is('charity_navigator_rating', null)  // Only charities without ratings
      .limit(Math.min(limit, 100));

    if (fetchError) {
      console.error('Error fetching charities:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch charities' },
        { status: 500 }
      );
    }

    if (!charities || charities.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No charities need enrichment',
        stats: { enriched: 0, errors: 0 },
      });
    }

    console.log(`[Enrich] Processing ${charities.length} charities...`);

    for (const charity of charities) {
      try {
        const result = await enrichCharity(charity, providers);
        enriched++;
        results.push(result);

        // Rate limiting - wait 200ms between requests
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`Error enriching ${charity.ein}:`, err);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Enriched ${enriched} charities`,
      stats: {
        total: charities.length,
        enriched,
        errors,
      },
      charities: results,
    });
  } catch (err: any) {
    console.error('Error in charity enrichment:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}

/**
 * Enrich a single charity with ratings from external APIs
 */
async function enrichCharity(
  charity: { id: string; ein: string; name: string },
  providers: string[]
) {
  const adminClient = createAdminClient();
  const updates: any = {};

  console.log(`[Enrich] Processing ${charity.name} (${charity.ein})`);

  // Fetch Charity Navigator rating
  if (providers.includes('charity_navigator')) {
    try {
      const cnRating = await getCharityNavigatorRating(charity.ein);
      if (cnRating) {
        updates.charity_navigator_rating = transformCharityNavigatorRating(cnRating);
        updates.ratings_last_updated = new Date().toISOString();

        // Also update mission if available
        if (cnRating.mission && !updates.mission_statement) {
          updates.mission_statement = cnRating.mission;
        }

        // Update address if available
        if (cnRating.mailingAddress) {
          if (!updates.city && cnRating.mailingAddress.city) {
            updates.city = cnRating.mailingAddress.city;
          }
          if (!updates.state && cnRating.mailingAddress.stateOrProvince) {
            updates.state = cnRating.mailingAddress.stateOrProvince;
          }
        }

        console.log(`  ✅ Charity Navigator: Score ${cnRating.currentRating?.score}`);
      } else {
        console.log(`  ⏭️  Charity Navigator: Not found`);
      }
    } catch (err) {
      console.error(`  ❌ Charity Navigator error:`, err);
    }
  }

  // Fetch Candid seal
  if (providers.includes('candid')) {
    try {
      const candidSeal = await getCandidSeal(charity.ein);
      if (candidSeal) {
        updates.candid_rating = transformCandidSeal(candidSeal);
        updates.ratings_last_updated = new Date().toISOString();

        console.log(`  ✅ Candid: ${candidSeal.seal_level} seal`);
      } else {
        console.log(`  ⏭️  Candid: Not found`);
      }
    } catch (err) {
      console.error(`  ❌ Candid error:`, err);
    }
  }

  // Update charity if we got any data
  if (Object.keys(updates).length > 0) {
    const { error } = await adminClient
      .from('charities')
      .update(updates)
      .eq('id', charity.id);

    if (error) {
      console.error(`  ❌ Database update error:`, error);
      throw error;
    }
  }

  return {
    ...charity,
    ...updates,
  };
}
