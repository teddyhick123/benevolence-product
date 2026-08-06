\set ON_ERROR_STOP on

BEGIN;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'schema-check@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

INSERT INTO public.organizations (id, name)
VALUES ('20000000-0000-0000-0000-000000000001', 'Schema behavior check');

INSERT INTO public.portfolios (id, org_id, owner_id, name) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'With donations'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Without donations');

INSERT INTO public.holdings (
  id, portfolio_id, org_id, asset_type, status, name, funds_allocated, deleted_at
) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'donation', 'active', 'Visible donation', 1000, NULL),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'donation', 'active', 'Deleted donation', 9999, now()),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'equity', 'active', 'Non-donation holding', 5000, NULL);

INSERT INTO public.tax_contributions (
  id, portfolio_id, org_id, tax_year, contribution_date, recipient_name,
  contribution_type, amount_usd, fmv_at_donation, cost_basis, deductible_amount
) VALUES
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2026, CURRENT_DATE, 'Donation recipient', 'stock', 1000, 1000, 400, 900),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2026, CURRENT_DATE, 'Equity recipient', 'stock', 5000, 5000, 100, 5000);

INSERT INTO public.holding_contributions (
  portfolio_id, org_id, holding_id, tax_contribution_id, amount_usd, contribution_date
) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1000, CURRENT_DATE),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 5000, CURRENT_DATE);

INSERT INTO public.tax_carryforwards (
  portfolio_id, org_id, tax_contribution_id, originating_tax_year, amount,
  amount_remaining, agi_limit_category, expires_tax_year
) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 2025, 100, 100, '30_appreciated', 2030),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 2025, 700, 700, '30_appreciated', 2030);

DO $$
DECLARE
  v_summary record;
  v_zero record;
BEGIN
  SELECT * INTO v_summary
  FROM public.v_portfolio_donation_summary
  WHERE portfolio_id = '30000000-0000-0000-0000-000000000001';

  IF v_summary.total_donations <> 1
     OR v_summary.linked_tax_contributions <> 1
     OR v_summary.total_tax_deductible_amount <> 900
     OR v_summary.total_appreciated_asset_gain <> 600
     OR v_summary.total_carryforward_available <> 100 THEN
    RAISE EXCEPTION 'donation summary is not scoped to live donation holdings: %', row_to_json(v_summary);
  END IF;

  IF (SELECT COUNT(*) FROM public.v_portfolio_donations WHERE portfolio_id = v_summary.portfolio_id) <> 1
     OR NOT (SELECT has_tax_contribution FROM public.v_portfolio_donations WHERE portfolio_id = v_summary.portfolio_id) THEN
    RAISE EXCEPTION 'donation listing view did not apply canonical scope/linkage';
  END IF;

  SELECT * INTO v_zero
  FROM public.v_portfolio_donation_summary
  WHERE portfolio_id = '30000000-0000-0000-0000-000000000002';
  IF NOT FOUND OR v_zero.total_donations <> 0 THEN
    RAISE EXCEPTION 'zero-donation portfolio must still have a summary row';
  END IF;
END;
$$;

SELECT * FROM public.create_generated_letter(
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '{"letter_content":"one","summary_data":{"portfolio":{},"summary":{},"kpis":[],"holdings":[]}}'::jsonb
);
SELECT * FROM public.create_generated_letter(
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '{"malformed":true}'::jsonb
);

DO $$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM public.generated_documents
      WHERE portfolio_id = '30000000-0000-0000-0000-000000000001' AND document_type = 'letter')
     IS DISTINCT FROM ARRAY[1, 2] THEN
    RAISE EXCEPTION 'generated letter versions were not allocated monotonically';
  END IF;
END;
$$;

INSERT INTO public.charities (id, ein, name)
VALUES ('60000000-0000-0000-0000-000000000001', '12-3456789', 'Canonical charity');

SELECT public.link_holding_to_charity(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001'
);
SELECT public.link_holding_to_charity(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001'
);

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.investees WHERE charity_id = '60000000-0000-0000-0000-000000000001') <> 1
     OR (SELECT investee_id FROM public.holdings WHERE id = '40000000-0000-0000-0000-000000000001') IS NULL THEN
    RAISE EXCEPTION 'holding/charity linking was not idempotent';
  END IF;
END;
$$;

SELECT public.generate_risk_snapshot('30000000-0000-0000-0000-000000000001');
CREATE TEMP TABLE first_risk_created_at AS
  SELECT created_at FROM public.portfolio_risk_snapshots
  WHERE portfolio_id = '30000000-0000-0000-0000-000000000001';
SELECT pg_sleep(0.01);
SELECT public.generate_risk_snapshot('30000000-0000-0000-0000-000000000001');

DO $$
BEGIN
  IF (SELECT created_at FROM public.portfolio_risk_snapshots
      WHERE portfolio_id = '30000000-0000-0000-0000-000000000001')
     IS DISTINCT FROM (SELECT created_at FROM first_risk_created_at) THEN
    RAISE EXCEPTION 'risk snapshot upsert changed created_at';
  END IF;
END;
$$;

ROLLBACK;
