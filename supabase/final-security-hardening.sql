-- Final security hardening for the Quiz App production schema.
-- Apply after the Pages Functions admin API is deployed.

BEGIN;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS "banks_select" ON public.question_banks;
DROP POLICY IF EXISTS "banks_insert" ON public.question_banks;
DROP POLICY IF EXISTS "banks_update" ON public.question_banks;
DROP POLICY IF EXISTS "banks_delete_owner_or_admin" ON public.question_banks;
CREATE POLICY "banks_select_visible"
  ON public.question_banks FOR SELECT TO authenticated
  USING (
    review_status = 'approved'
    OR created_by = (SELECT auth.uid())
    OR public.is_admin()
  );
CREATE POLICY "banks_insert_pending"
  ON public.question_banks FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (review_status = 'pending' OR public.is_admin())
  );
CREATE POLICY "banks_update_owner_or_admin"
  ON public.question_banks FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (created_by = (SELECT auth.uid()) AND review_status <> 'approved')
  );
CREATE POLICY "banks_delete_owner_or_admin"
  ON public.question_banks FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (created_by = (SELECT auth.uid()) AND review_status <> 'approved')
  );
REVOKE ALL PRIVILEGES ON TABLE public.question_banks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_banks TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.questions FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.questions TO authenticated;

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY "audit_logs_admin_insert"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
REVOKE ALL PRIVILEGES ON TABLE public.audit_logs FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.admin_audit_log FROM anon, authenticated;
DROP POLICY IF EXISTS "admin_audit_log_admin_select" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_admin_select"
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "page_views_insert" ON public.page_views;
DROP POLICY IF EXISTS "page_views_select" ON public.page_views;
CREATE POLICY "page_views_admin_select"
  ON public.page_views FOR SELECT TO authenticated
  USING (public.is_admin());
REVOKE ALL PRIVILEGES ON TABLE public.page_views FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.announcements FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.announcement_reads FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.feedback_items FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.practice_sessions FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.user_progress FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.upload_requests FROM anon;

DO $security$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.signature);
    IF fn.proconfig IS NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.signature);
    END IF;
  END LOOP;
END
$security$;

GRANT EXECUTE ON FUNCTION public.get_or_increment_page_view(text) TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
