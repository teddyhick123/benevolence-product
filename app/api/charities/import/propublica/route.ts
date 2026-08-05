import { NextResponse } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import { createCharityAdminRepository } from '@/lib/api/repositories/charities-admin';
import { searchOrganizations, getOrganization, convertToCharity } from '@/lib/services/propublica';

/**
 * POST /api/charities/import/propublica
 * Import charities from ProPublica Nonprofit Explorer API
 *
 * Body:
 * - mode: 'search' | 'ein' | 'batch'
 * - query: Search query (for mode='search')
 * - ein: EIN to import (for mode='ein')
 * - eins: Array of EINs (for mode='batch')
 * - state: State filter (optional, for mode='search')
 */
export async function POST(req: Request) {
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;
  const repository = createCharityAdminRepository(access.context);

  try {
    const body = await req.json();
    const { mode, query, ein, eins, state } = body;

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const results: any[] = [];

    if (mode === 'search') {
      // Search and import matching organizations
      if (!query) {
        return NextResponse.json(
          { error: 'Query is required for search mode' },
          { status: 400 }
        );
      }

      const searchResults = await searchOrganizations(query, state);

      for (const org of searchResults.organizations) {
        try {
          const charityData = convertToCharity(org);

          // Check if already exists
          const existing = await repository.findByEin(charityData.ein);

          if (existing) {
            skipped++;
            continue;
          }

          // Insert new charity
          try {
            const charity = await repository.insert(charityData);
            imported++;
            results.push(charity);
          } catch (error) {
            console.error(`Error importing ${charityData.ein}:`, error);
            errors++;
          }
        } catch (err) {
          console.error('Error processing organization:', err);
          errors++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Imported ${imported} charities from ProPublica`,
        stats: {
          total: searchResults.total_results,
          imported,
          skipped,
          errors,
        },
        charities: results,
      });
    }

    if (mode === 'ein') {
      // Import single organization by EIN
      if (!ein) {
        return NextResponse.json(
          { error: 'EIN is required for ein mode' },
          { status: 400 }
        );
      }

      // Check if already exists
      const existing = await repository.findByEin(ein);

      if (existing) {
        return NextResponse.json({
          success: true,
          message: 'Charity already exists',
          charity_id: existing.id,
          skipped: true,
        });
      }

      // Fetch from ProPublica
      const org = await getOrganization(ein);

      if (!org) {
        return NextResponse.json(
          { error: 'Organization not found in ProPublica database' },
          { status: 404 }
        );
      }

      const charityData = convertToCharity(org);

      // Insert new charity
      let charity;
      try {
        charity = await repository.insert(charityData);
      } catch (error) {
        console.error(`Error importing ${ein}:`, error);
        return NextResponse.json(
          { error: 'Failed to import charity' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Charity imported successfully',
        charity,
      });
    }

    if (mode === 'batch') {
      // Import multiple organizations by EIN
      if (!eins || !Array.isArray(eins)) {
        return NextResponse.json(
          { error: 'EINs array is required for batch mode' },
          { status: 400 }
        );
      }

      for (const einToImport of eins) {
        try {
          // Check if already exists
          const existing = await repository.findByEin(einToImport);

          if (existing) {
            skipped++;
            continue;
          }

          // Fetch from ProPublica
          const org = await getOrganization(einToImport);

          if (!org) {
            errors++;
            continue;
          }

          const charityData = convertToCharity(org);

          // Insert new charity
          try {
            const charity = await repository.insert(charityData);
            imported++;
            results.push(charity);
          } catch (error) {
            console.error(`Error importing ${einToImport}:`, error);
            errors++;
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`Error processing EIN ${einToImport}:`, err);
          errors++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Batch import complete: ${imported} imported, ${skipped} skipped, ${errors} errors`,
        stats: {
          total: eins.length,
          imported,
          skipped,
          errors,
        },
        charities: results,
      });
    }

    return NextResponse.json(
      { error: 'Invalid mode. Must be "search", "ein", or "batch"' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('Error in ProPublica import:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
