-- =============================================================================
-- 0048_cpa_atomic_access_logging.sql
-- Atomically enforce CPA share max_accesses and write access audit logs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_cpa_access(
  p_share_link_id UUID,
  p_action TEXT,
  p_resource TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.cpa_share_links%ROWTYPE;
  v_access_count INTEGER;
BEGIN
  SELECT *
  INTO v_link
  FROM public.cpa_share_links
  WHERE id = p_share_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'access_granted', false,
      'reason', 'Share link not found',
      'access_count', NULL
    );
  END IF;

  IF v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'access_granted', false,
      'reason', 'This share link has been revoked by the portfolio owner.',
      'access_count', v_link.access_count
    );
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'access_granted', false,
      'reason', 'This share link has expired.',
      'access_count', v_link.access_count
    );
  END IF;

  IF v_link.max_accesses IS NOT NULL AND v_link.access_count >= v_link.max_accesses THEN
    RETURN jsonb_build_object(
      'access_granted', false,
      'reason', 'This share link has reached its maximum number of accesses.',
      'access_count', v_link.access_count
    );
  END IF;

  UPDATE public.cpa_share_links
  SET access_count = access_count + 1,
      updated_at = NOW()
  WHERE id = p_share_link_id
  RETURNING access_count INTO v_access_count;

  INSERT INTO public.cpa_access_logs (
    share_link_id,
    action,
    resource,
    ip_address,
    user_agent
  )
  VALUES (
    p_share_link_id,
    p_action,
    p_resource,
    p_ip_address,
    p_user_agent
  );

  RETURN jsonb_build_object(
    'access_granted', true,
    'reason', NULL,
    'access_count', v_access_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_cpa_access(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
