-- 刷题 App - 站内公告与用户反馈系统
-- 执行位置：Supabase Dashboard -> SQL Editor
-- 说明：Pages Functions 会通过 SERVICE_ROLE_KEY 管理后台数据；RLS 仍作为 Data API 的防线。

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'success', 'warning', 'critical')),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS feedback_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('bug', 'suggestion', 'content', 'account', 'other')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'closed')),
  admin_reply TEXT,
  replied_by UUID REFERENCES profiles(id),
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_visible_idx ON announcements (is_published, is_pinned, published_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_items_user_created_idx ON feedback_items (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_items_status_created_idx ON feedback_items (status, created_at DESC);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select_visible" ON announcements;
CREATE POLICY "announcements_select_visible" ON announcements FOR SELECT
TO authenticated
USING (
  is_published = true
  AND (published_at IS NULL OR published_at <= now())
  AND (expires_at IS NULL OR expires_at >= now())
);

DROP POLICY IF EXISTS "announcements_admin_all" ON announcements;
CREATE POLICY "announcements_admin_all" ON announcements FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "announcement_reads_own" ON announcement_reads;
CREATE POLICY "announcement_reads_own" ON announcement_reads FOR ALL
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "feedback_items_own_select" ON feedback_items;
CREATE POLICY "feedback_items_own_select" ON feedback_items FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id OR is_admin());

DROP POLICY IF EXISTS "feedback_items_own_insert" ON feedback_items;
CREATE POLICY "feedback_items_own_insert" ON feedback_items FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "feedback_items_own_delete_open" ON feedback_items;
CREATE POLICY "feedback_items_own_delete_open" ON feedback_items FOR DELETE
TO authenticated
USING (
  (select auth.uid()) = user_id
  AND status = 'open'
  AND NULLIF(BTRIM(COALESCE(admin_reply, '')), '') IS NULL
);
DROP POLICY IF EXISTS "feedback_items_admin_update" ON feedback_items;
CREATE POLICY "feedback_items_admin_update" ON feedback_items FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

GRANT SELECT ON TABLE announcements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE announcement_reads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE feedback_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE announcements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE announcement_reads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE feedback_items TO service_role;

COMMENT ON TABLE announcements IS '站内公告：管理员发布，用户查看并标记已读';
COMMENT ON TABLE feedback_items IS '用户反馈：用户提交，管理员按账号回复';
