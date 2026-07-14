-- Consolidate duplicated policies and add indexes used by ownership and admin lookups.
BEGIN;

DROP POLICY IF EXISTS "progress_own" ON public.user_progress;
DROP POLICY IF EXISTS "progress_select" ON public.user_progress;
DROP POLICY IF EXISTS "progress_insert" ON public.user_progress;
DROP POLICY IF EXISTS "progress_update" ON public.user_progress;
DROP POLICY IF EXISTS "progress_delete" ON public.user_progress;
CREATE POLICY "progress_select_own" ON public.user_progress FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "progress_insert_own" ON public.user_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "progress_update_own" ON public.user_progress FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "progress_delete_own" ON public.user_progress FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "sessions_select" ON public.practice_sessions;
DROP POLICY IF EXISTS "sessions_insert" ON public.practice_sessions;
CREATE POLICY "sessions_select_own" ON public.practice_sessions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "sessions_insert_own" ON public.practice_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "questions_insert" ON public.questions;
CREATE POLICY "questions_insert_owner_or_admin" ON public.questions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.question_banks
      WHERE id = bank_id AND created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "requests_insert" ON public.upload_requests;
CREATE POLICY "requests_insert_own" ON public.upload_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "announcements_select_visible" ON public.announcements;
DROP POLICY IF EXISTS "announcements_admin_all" ON public.announcements;
CREATE POLICY "announcements_select_visible_or_admin" ON public.announcements FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      is_published = true
      AND (published_at IS NULL OR published_at <= now())
      AND (expires_at IS NULL OR expires_at >= now())
    )
  );
CREATE POLICY "announcements_admin_insert" ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "announcements_admin_update" ON public.announcements FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "announcements_admin_delete" ON public.announcements FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS announcement_reads_user_id_idx ON public.announcement_reads (user_id);
CREATE INDEX IF NOT EXISTS announcements_created_by_idx ON public.announcements (created_by);
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS feedback_items_replied_by_idx ON public.feedback_items (replied_by);
CREATE INDEX IF NOT EXISTS practice_sessions_bank_id_idx ON public.practice_sessions (bank_id);
CREATE INDEX IF NOT EXISTS upload_requests_approved_by_idx ON public.upload_requests (approved_by);
CREATE INDEX IF NOT EXISTS upload_requests_user_id_idx ON public.upload_requests (user_id);
CREATE INDEX IF NOT EXISTS user_progress_bank_id_idx ON public.user_progress (bank_id);

DROP INDEX IF EXISTS public.idx_practice_sessions_user_bank;
DROP INDEX IF EXISTS public.idx_progress_user;

COMMIT;
