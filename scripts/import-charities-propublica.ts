/**
 * Import Charities from ProPublica
 *
 * This script imports real charity data from ProPublica's Nonprofit Explorer API
 *
 * Usage:
 *   npx ts-node scripts/import-charities-propublica.ts
 */

// Well-known charity EINs to import
const WELL_KNOWN_CHARITIES = [
  '53-0196605',  // American Red Cross
  '13-1760110',  // Doctors Without Borders USA
  '94-1467465',  // Feeding America
  '13-1685039',  // The Nature Conservancy
  '13-1740140',  // Khan Academy
  '52-1693387',  // Goodwill Industries International
  '13-1623570',  // Planned Parenthood Federation of America
  '13-1760110',  // Médecins Sans Frontières (Doctors Without Borders)
  '95-1831116',  // World Wildlife Fund
  '13-1685039',  // The Nature Conservancy
  '53-0242652',  // Habitat for Humanity International
  '13-3433452',  // St. Jude Children's Research Hospital
  '35-0868122',  // Make-A-Wish Foundation of America
  '13-5562162',  // American Cancer Society
  '36-2167147',  // United Way Worldwide
];

async function importCharities() {
  console.log('🌍 Importing charities from ProPublica Nonprofit Explorer...\n');

  try {
    const response = await fetch('http://localhost:3000/api/charities/import/propublica', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'batch',
        eins: WELL_KNOWN_CHARITIES,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Import Complete!\n');
      console.log(`📊 Stats:`);
      console.log(`   Total: ${data.stats.total}`);
      console.log(`   ✅ Imported: ${data.stats.imported}`);
      console.log(`   ⏭️  Skipped: ${data.stats.skipped}`);
      console.log(`   ❌ Errors: ${data.stats.errors}`);

      if (data.charities && data.charities.length > 0) {
        console.log(`\n📋 Imported Charities:`);
        data.charities.forEach((charity: any) => {
          console.log(`   • ${charity.name} (EIN: ${charity.ein})`);
        });
      }
    } else {
      console.error('❌ Import failed:', data.error);
      if (data.details) {
        console.error('   Details:', data.details);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

importCharities();
