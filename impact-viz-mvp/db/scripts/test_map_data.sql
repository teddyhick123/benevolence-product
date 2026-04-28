-- Test data for map visualization
-- This adds sample locations to holdings that exist in your portfolio

-- First, let's add coordinates to some existing holdings
-- (Replace portfolio_id with your actual portfolio ID)

-- Update holdings with geocoded coordinates for major US cities
-- You can run this to add coordinates to your first few holdings

-- Example: San Francisco
UPDATE public.holdings
SET
  latitude = 37.7749,
  longitude = -122.4194,
  location_city = 'San Francisco',
  location_state = 'California',
  location_country = 'United States',
  geocoded_at = NOW(),
  geocode_status = 'success'
WHERE id IN (
  SELECT id FROM public.holdings
  WHERE latitude IS NULL
  ORDER BY created_at
  LIMIT 1
);

-- Example: New York
UPDATE public.holdings
SET
  latitude = 40.7128,
  longitude = -74.0060,
  location_city = 'New York',
  location_state = 'New York',
  location_country = 'United States',
  geocoded_at = NOW(),
  geocode_status = 'success'
WHERE id IN (
  SELECT id FROM public.holdings
  WHERE latitude IS NULL
  ORDER BY created_at
  LIMIT 1 OFFSET 1
);

-- Example: Austin
UPDATE public.holdings
SET
  latitude = 30.2672,
  longitude = -97.7431,
  location_city = 'Austin',
  location_state = 'Texas',
  location_country = 'United States',
  geocoded_at = NOW(),
  geocode_status = 'success'
WHERE id IN (
  SELECT id FROM public.holdings
  WHERE latitude IS NULL
  ORDER BY created_at
  LIMIT 1 OFFSET 2
);

-- Example: Seattle
UPDATE public.holdings
SET
  latitude = 47.6062,
  longitude = -122.3321,
  location_city = 'Seattle',
  location_state = 'Washington',
  location_country = 'United States',
  geocoded_at = NOW(),
  geocode_status = 'success'
WHERE id IN (
  SELECT id FROM public.holdings
  WHERE latitude IS NULL
  ORDER BY created_at
  LIMIT 1 OFFSET 3
);

-- Example: Boston
UPDATE public.holdings
SET
  latitude = 42.3601,
  longitude = -71.0589,
  location_city = 'Boston',
  location_state = 'Massachusetts',
  location_country = 'United States',
  geocoded_at = NOW(),
  geocode_status = 'success'
WHERE id IN (
  SELECT id FROM public.holdings
  WHERE latitude IS NULL
  ORDER BY created_at
  LIMIT 1 OFFSET 4
);

-- Verify the updates
SELECT
  id,
  name,
  location_city,
  location_state,
  latitude,
  longitude,
  geocode_status
FROM public.holdings
WHERE latitude IS NOT NULL
ORDER BY updated_at DESC;
