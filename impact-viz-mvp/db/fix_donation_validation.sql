-- Quick fix to allow stock donations
-- Updates the validation function to permit any contribution type for donations

CREATE OR REPLACE FUNCTION validate_tax_contribution_consistency()
RETURNS TRIGGER AS $$
DECLARE
  h_asset_type TEXT;
BEGIN
  -- Only validate if holding_id is provided
  IF NEW.holding_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the asset type of the linked holding
  SELECT asset_type INTO h_asset_type
  FROM public.holdings
  WHERE id = NEW.holding_id;

  -- If holding not found, let foreign key constraint handle it
  IF h_asset_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Validate consistency between asset_type and contribution_type
  CASE h_asset_type
    -- Equity investments should use stock or crypto
    WHEN 'equity_investment' THEN
      IF NEW.contribution_type NOT IN ('stock', 'crypto') THEN
        RAISE EXCEPTION 'Equity investments must use stock or crypto contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Debt investments should use other_property
    WHEN 'debt_investment' THEN
      IF NEW.contribution_type NOT IN ('other_property', 'cash') THEN
        RAISE EXCEPTION 'Debt investments should use other_property or cash contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- PRIs and MRIs should use other_property
    WHEN 'pri', 'mri' THEN
      IF NEW.contribution_type NOT IN ('other_property') THEN
        RAISE EXCEPTION 'PRI/MRI investments should use other_property contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Foundation and DAF grants should use cash-based types
    WHEN 'foundation_grant', 'daf_grant' THEN
      IF NEW.contribution_type NOT IN ('cash', 'check', 'wire') THEN
        RAISE EXCEPTION 'Foundation and DAF grants should use cash-based contribution types (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Donations can be any type (stock, crypto, cash, real_estate, etc.)
    WHEN 'donation' THEN
      -- No restriction - donations can be any asset type
      NULL;

    ELSE
      -- For 'other' or unknown types, allow any contribution_type
      NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
