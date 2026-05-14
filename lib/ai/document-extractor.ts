import { AI_MODELS } from '@/lib/ai/models';
import { generateText } from '@/lib/ai/text';

export type ExtractedFact = {
  metric_code: string;
  value: number;
  unit?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  holding_id?: string | null;
  holding_name?: string | null;
  sector?: string | null;
  country?: string | null;
  source?: string | null;
  verification_level?: string | null;
  data_quality_score?: number | null;
};

export type ExtractedLocation = {
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  lon?: number | null;
  lat?: number | null;
  tags?: string[];
  status?: string | null;
};

export type ExtractionResult = {
  facts: ExtractedFact[];
  locations?: ExtractedLocation[];
  summary?: string;
};

const COMMON_METRIC_CODES = [
  'WACI',           // Weighted Average Carbon Intensity
  'FEMISS',         // Financed Emissions
  'RE_MWH',         // Renewable Energy (MWh)
  'JOBS_FTE',       // Jobs Created (Full-Time Equivalent)
  'WOM_LEAD_PCT',   // Women in Leadership (%)
  'REV_IMPACT_PCT', // Revenue from Impact Products (%)
  'HH_REACHED',     // Households Reached
  'WATER_SAVED',    // Water Saved (liters/gallons)
  'WASTE_DIVERTED', // Waste Diverted from Landfill
  'TREES_PLANTED',  // Trees Planted
  'CARBON_AVOIDED', // Carbon Avoided (tCO2e)
];

function buildSystemPrompt(restrictedMetrics?: string[]): string {
  if (restrictedMetrics && restrictedMetrics.length > 0) {
    // Restricted mode: only extract specific metrics
    return `You are a deterministic data extraction model for impact investing.
Your task is to extract KPI facts from financial and impact reports.

IMPORTANT: Only extract metrics with these EXACT codes: ${restrictedMetrics.join(', ')}

Return ONLY valid JSON with a single key 'facts', which is an array of objects.
Each fact object must have these fields:
- metric_code: string (must be one of: ${restrictedMetrics.join(', ')})
- value: number
- unit: string (optional)
- period_start: ISO date string (optional)
- period_end: ISO date string (optional)
- holding_id: string (optional)
- holding_name: string (optional)
- sector: string (optional)
- country: string (optional)
- source: string (optional, defaults to "Document")
- verification_level: string (optional, defaults to "Issuer Reported")
- data_quality_score: number 0-1 (optional, defaults to 0.6)

If you cannot extract a fact with confidence, omit it. Never guess or hallucinate data.
If a field is uncertain, use null.

Be conservative and only extract facts that are clearly stated in the document.`;
  }

  // AI mode: discover any relevant metrics
  return `You are a deterministic data extraction model for impact investing.
Your task is to extract ANY relevant KPI facts AND location information from financial and impact reports.

Return ONLY valid JSON with these keys:
1. 'facts' - array of KPI fact objects
2. 'locations' - array of location objects (optional, only if location info is found)

Each fact object must have these fields:
- metric_code: string (use UPPERCASE_SNAKE_CASE, e.g. "CARBON_EMISSIONS", "JOBS_CREATED", "WATER_USAGE")
- value: number
- unit: string (e.g., "tCO2e", "MWh", "people", "USD", "%")
- period_start: ISO date string (optional)
- period_end: ISO date string (optional)
- holding_id: string (optional)
- holding_name: string (optional)
- sector: string (optional)
- country: string (optional)
- source: string (optional, defaults to "Document")
- verification_level: string (optional, defaults to "Issuer Reported")
- data_quality_score: number 0-1 (optional, defaults to 0.6)

Each location object must have these fields:
- name: string (location name, e.g., "Headquarters", "Project Site", "Manufacturing Facility")
- city: string (optional)
- state: string (optional)
- country: string (optional)
- lon: number (longitude, optional, only if you can determine coordinates)
- lat: number (latitude, optional, only if you can determine coordinates)
- tags: string array (optional, e.g., ["headquarters", "manufacturing"])
- status: string (optional, e.g., "Active", "Operational")

Common metric codes to use when appropriate: ${COMMON_METRIC_CODES.join(', ')}

If you find a metric not in the common list, create a descriptive metric_code in UPPERCASE_SNAKE_CASE.
Examples:
- "CARBON_EMISSIONS" for carbon/GHG data
- "ENERGY_CONSUMPTION" for energy use
- "WATER_USAGE" for water consumption
- "WASTE_GENERATED" for waste metrics
- "BIODIVERSITY_SCORE" for biodiversity metrics
- "SOCIAL_IMPACT_SCORE" for social metrics

For locations:
- Extract any mentions of cities, addresses, operational locations, project sites, etc.
- DO NOT try to guess coordinates unless they are explicitly stated
- If you find a city/country, include it even without coordinates (geocoding can happen later)

If you cannot extract a fact or location with confidence, omit it. Never guess or hallucinate data.
If a field is uncertain, use null.

Be conservative and only extract information that is clearly stated in the document.`;
}

/**
 * Extract structured KPI facts from document text using the configured AI provider.
 */
export async function extractFactsFromText(
  text: string,
  options?: {
    restrictedMetrics?: string[];
    holdingId?: string;
    holdingName?: string;
  }
): Promise<ExtractionResult> {
  // Build the system prompt based on mode
  const systemPrompt = buildSystemPrompt(options?.restrictedMetrics);

  // Build the user prompt
  let userPrompt = `Extract KPI facts from the following document text.\n\n`;

  if (options?.holdingId || options?.holdingName) {
    userPrompt += `Context: This document is for holding "${options.holdingName || options.holdingId}"\n\n`;
  }

  userPrompt += `Document text:\n${text.slice(0, 15000)}`; // Limit to ~15k chars to stay within token limits

  try {
    const content = await generateText({
      model: AI_MODELS.assistant,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0,
      maxTokens: 4096,
    });

    if (!content) {
      throw new Error('AI provider returned empty response');
    }

    let result: any;
    try {
      result = JSON.parse(content);
    } catch (e) {
      throw new Error(`AI provider did not return valid JSON: ${content}`);
    }

    if (!result || !Array.isArray(result.facts)) {
      throw new Error('AI provider response missing "facts" array');
    }

    // Validate and filter facts
    const validFacts: ExtractedFact[] = result.facts
      .filter((fact: any) => {
        // Must have metric_code and value
        if (!fact.metric_code || fact.value == null) return false;

        // Validate metric_code format (UPPERCASE_SNAKE_CASE)
        if (!/^[A-Z][A-Z0-9_]*$/.test(fact.metric_code)) {
          console.warn(`Invalid metric_code format: ${fact.metric_code}`);
          return false;
        }

        // If restricted metrics specified, filter
        if (options?.restrictedMetrics && options.restrictedMetrics.length > 0) {
          if (!options.restrictedMetrics.includes(fact.metric_code)) return false;
        }

        return true;
      })
      .map((fact: any) => ({
        metric_code: String(fact.metric_code),
        value: Number(fact.value),
        unit: fact.unit || null,
        period_start: fact.period_start || null,
        period_end: fact.period_end || null,
        holding_id: options?.holdingId || fact.holding_id || null,
        holding_name: options?.holdingName || fact.holding_name || null,
        sector: fact.sector || null,
        country: fact.country || null,
        source: fact.source || 'Document',
        verification_level: fact.verification_level || 'Issuer Reported',
        data_quality_score: fact.data_quality_score != null ? Number(fact.data_quality_score) : 0.6,
      }));

    // Validate and filter locations
    const validLocations: ExtractedLocation[] = (result.locations || [])
      .filter((loc: any) => {
        // Must have name
        if (!loc.name) return false;
        // If coordinates provided, both must be valid numbers
        if (loc.lon != null || loc.lat != null) {
          const lon = Number(loc.lon);
          const lat = Number(loc.lat);
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
          if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return false;
        }
        return true;
      })
      .map((loc: any) => ({
        name: String(loc.name),
        city: loc.city || null,
        state: loc.state || null,
        country: loc.country || null,
        lon: loc.lon != null ? Number(loc.lon) : null,
        lat: loc.lat != null ? Number(loc.lat) : null,
        tags: Array.isArray(loc.tags) ? loc.tags.map(String) : [],
        status: loc.status || null,
      }));

    return {
      facts: validFacts,
      locations: validLocations.length > 0 ? validLocations : undefined,
      summary: result.summary || undefined,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Upsert metric definitions to ensure they exist in the database
 */
export function getUniqueMetricCodes(facts: ExtractedFact[]): string[] {
  return Array.from(new Set(facts.map((f) => f.metric_code).filter(Boolean)));
}
