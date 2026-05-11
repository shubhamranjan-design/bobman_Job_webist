-- ============================================================
-- AUDIT LOG SYSTEM - Run this in Supabase SQL Editor
-- Tracks all INSERT, UPDATE, DELETE across 19 tables
-- ============================================================

-- ============================================================
-- STEP 1: Create the audit_log table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
    id              BIGSERIAL PRIMARY KEY,
    table_name      TEXT NOT NULL,
    operation       TEXT NOT NULL,
    row_id          TEXT,
    old_data        JSONB,
    new_data        JSONB,
    changed_fields  TEXT[],
    changed_by      TEXT DEFAULT 'system',
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_audit_log_table      ON public.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON public.audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_operation  ON public.audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_audit_log_row_id     ON public.audit_log(row_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_time ON public.audit_log(table_name, changed_at DESC);

-- ============================================================
-- STEP 2: Create the generic trigger function
-- Optimized: UPDATEs only store changed columns (diff), not full row
-- Also supports app.audit_actor for tracking who made the change
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    full_old    JSONB;
    full_new    JSONB;
    diff_old    JSONB;
    diff_new    JSONB;
    changed     TEXT[];
    key         TEXT;
    row_pk      TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        full_old := to_jsonb(OLD);
        row_pk   := full_old ->> 'id';
    ELSE
        full_new := to_jsonb(NEW);
        row_pk   := full_new ->> 'id';
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, old_data, new_data, changed_by)
        VALUES (
            TG_TABLE_NAME, 'INSERT', row_pk, NULL, full_new,
            COALESCE(current_setting('app.audit_actor', true),
                     current_setting('request.jwt.claim.sub', true), 'system')
        );
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        full_old := to_jsonb(OLD);
        changed  := ARRAY[]::TEXT[];
        diff_old := '{}'::JSONB;
        diff_new := '{}'::JSONB;

        FOR key IN SELECT jsonb_object_keys(full_new)
        LOOP
            IF (full_new -> key) IS DISTINCT FROM (full_old -> key) THEN
                changed  := changed || key;
                diff_old := diff_old || jsonb_build_object(key, full_old -> key);
                diff_new := diff_new || jsonb_build_object(key, full_new -> key);
            END IF;
        END LOOP;

        -- Skip if nothing actually changed
        IF array_length(changed, 1) IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO public.audit_log (table_name, operation, row_id, old_data, new_data, changed_fields, changed_by)
        VALUES (
            TG_TABLE_NAME, 'UPDATE', row_pk, diff_old, diff_new, changed,
            COALESCE(current_setting('app.audit_actor', true),
                     current_setting('request.jwt.claim.sub', true), 'system')
        );
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, old_data, new_data, changed_by)
        VALUES (
            TG_TABLE_NAME, 'DELETE', row_pk, full_old, NULL,
            COALESCE(current_setting('app.audit_actor', true),
                     current_setting('request.jwt.claim.sub', true), 'system')
        );
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STEP 3: Attach triggers to all 19 tables
-- ============================================================
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'users',
        'conversations',
        'whatsapp_conversations',
        'candidate_jd_matches',
        'jd_data',
        'recruiter_emails',
        'screening_sessions',
        'screening_results',
        'screening_skill_assessments',
        'call_outcomes',
        'matching_batch_logs',
        'matching_sessions',
        'redirect_short_url',
        'referral_codes',
        'referrals',
        'scheduled_callbacks',
        'user_nudges',
        'whatsapp_auth_tokens',
        'whatsapp_con_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON public.%I', tbl);
        EXECUTE format(
            'CREATE TRIGGER audit_trigger
             AFTER INSERT OR UPDATE OR DELETE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func()',
            tbl
        );
        RAISE NOTICE 'Audit trigger attached to %', tbl;
    END LOOP;
END;
$$;

-- ============================================================
-- STEP 4: Helper function to add audit to future tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.enable_audit(target_table TEXT)
RETURNS TEXT AS $$
BEGIN
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON public.%I', target_table);
    EXECUTE format(
        'CREATE TRIGGER audit_trigger
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func()',
        target_table
    );
    RETURN 'Audit enabled for ' || target_table;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DONE! Verify with:
-- ============================================================
-- SELECT * FROM audit_log ORDER BY changed_at DESC LIMIT 10;
