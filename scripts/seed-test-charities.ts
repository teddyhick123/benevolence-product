/**
 * Seed Test Charities Script
 * Adds a few well-known charities to the database for testing
 *
 * Run with: npx ts-node scripts/seed-test-charities.ts
 */

const testCharities = [
  {
    ein: '53-0196605',
    name: 'American Red Cross',
    legal_name: 'American National Red Cross',
    website: 'https://www.redcross.org',
    sector: 'Human Services',
    mission_statement: 'The American Red Cross prevents and alleviates human suffering in the face of emergencies by mobilizing the power of volunteers and the generosity of donors.',
    description: 'The American Red Cross shelters, feeds and provides comfort to victims of disasters; supplies about 40% of the nation\'s blood; teaches skills that save lives; distributes international humanitarian aid; and supports veterans, military members and their families.',
    city: 'Washington',
    state: 'DC',
    country: 'United States',
    annual_revenue: 3064000000,
    contact_email: 'info@redcross.org',
    impact_focus: ['Disaster Relief', 'Blood Services', 'Health & Safety Training'],
    data_source: 'manual',
  },
  {
    ein: '13-1760110',
    name: 'Doctors Without Borders USA',
    legal_name: 'Médecins Sans Frontières USA Inc',
    website: 'https://www.doctorswithoutborders.org',
    sector: 'Health',
    mission_statement: 'Doctors Without Borders/Médecins Sans Frontières (MSF) cares for people affected by conflict, disease outbreaks, natural and human-made disasters, and exclusion from health care in more than 70 countries.',
    description: 'MSF provides emergency medical humanitarian care to people caught in conflict zones, epidemics, disasters, or excluded from healthcare. Our teams are made up of international and locally hired doctors, nurses, other medical professionals, logistical experts, water and sanitation engineers, and administrators.',
    city: 'New York',
    state: 'NY',
    country: 'United States',
    annual_revenue: 517000000,
    contact_email: 'info@doctorswithoutborders.org',
    impact_focus: ['Healthcare Access', 'Disaster Relief', 'Humanitarian Aid'],
    data_source: 'manual',
  },
  {
    ein: '94-1467465',
    name: 'Feeding America',
    legal_name: 'Feeding America',
    website: 'https://www.feedingamerica.org',
    sector: 'Human Services',
    mission_statement: 'Feeding America is the nation\'s largest domestic hunger-relief organization, working to connect people with food and end hunger.',
    description: 'Through a network of more than 200 food banks, 21 statewide food bank associations, and over 60,000 partner agencies, food pantries and meal programs, we helped provide 6.6 billion meals to tens of millions of people in need last year.',
    city: 'Chicago',
    state: 'IL',
    country: 'United States',
    annual_revenue: 4200000000,
    contact_email: 'media@feedingamerica.org',
    impact_focus: ['Food Security', 'Poverty Alleviation', 'Community Development'],
    data_source: 'manual',
  },
  {
    ein: '13-1685039',
    name: 'The Nature Conservancy',
    legal_name: 'The Nature Conservancy',
    website: 'https://www.nature.org',
    sector: 'Environment',
    mission_statement: 'The Nature Conservancy is a global environmental nonprofit working to create a world where people and nature can thrive.',
    description: 'We address the most pressing conservation threats at the largest scale. We tackle climate change, protect lands and waters, provide food and water sustainably, build healthy cities, and create economic opportunity.',
    city: 'Arlington',
    state: 'VA',
    country: 'United States',
    annual_revenue: 1100000000,
    contact_email: 'comment@tnc.org',
    impact_focus: ['Climate Action', 'Conservation', 'Environmental Protection'],
    data_source: 'manual',
  },
  {
    ein: '13-1740140',
    name: 'Khan Academy',
    legal_name: 'Khan Academy Inc',
    website: 'https://www.khanacademy.org',
    sector: 'Education',
    mission_statement: 'Khan Academy is a nonprofit with the mission to provide a free, world-class education for anyone, anywhere.',
    description: 'We offer practice exercises, instructional videos, and a personalized learning dashboard that empower learners to study at their own pace in and outside of the classroom. We tackle math, science, computing, history, art history, economics, and more.',
    city: 'Mountain View',
    state: 'CA',
    country: 'United States',
    annual_revenue: 65000000,
    contact_email: 'support@khanacademy.org',
    impact_focus: ['Education Access', 'Youth Programs', 'Technology'],
    data_source: 'manual',
  },
];

async function seedCharities() {
  console.log('🌱 Seeding test charities...\n');

  for (const charity of testCharities) {
    try {
      const response = await fetch('http://localhost:3000/api/charities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(charity),
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`✅ Added: ${charity.name} (EIN: ${charity.ein})`);
      } else if (response.status === 409) {
        console.log(`⏭️  Skipped: ${charity.name} (already exists)`);
      } else {
        console.error(`❌ Failed: ${charity.name} - ${data.error}`);
      }
    } catch (error) {
      console.error(`❌ Error adding ${charity.name}:`, error);
    }
  }

  console.log('\n✨ Seeding complete!');
}

seedCharities();
