-- ============================================
-- 修复 RLS 策略：去掉 profiles 的 is_admin() 死循环
-- ============================================

-- 1. profiles：用户只看自己，不做管理员判断（避免死循环）
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  id = auth.uid()
);

-- 2. question_banks：已审核公开+上传者可见
-- 管理员通过 SECURITY DEFINER RPC 跳过 RLS，不需要在策略里写 is_admin()
DROP POLICY IF EXISTS "banks_select" ON question_banks;
CREATE POLICY "banks_select" ON question_banks FOR SELECT USING (
  review_status = 'approved'
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "banks_update" ON question_banks;
CREATE POLICY "banks_update" ON question_banks FOR UPDATE USING (
  created_by = auth.uid()
);

-- 3. questions：题库可见即可见题目
DROP POLICY IF EXISTS "questions_select" ON questions;
CREATE POLICY "questions_select" ON questions FOR SELECT USING (
  EXISTS (SELECT 1 FROM question_banks WHERE id = bank_id)
);

DROP POLICY IF EXISTS "questions_insert" ON questions;
CREATE POLICY "questions_insert" ON questions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM question_banks WHERE id = bank_id AND created_by = auth.uid())
);

-- 4. user_progress：用户只看自己的
DROP POLICY IF EXISTS "progress_select" ON user_progress;
CREATE POLICY "progress_select" ON user_progress FOR SELECT USING (
  user_id = auth.uid()
);

-- 5. practice_sessions：用户只看自己的
DROP POLICY IF EXISTS "sessions_select" ON practice_sessions;
CREATE POLICY "sessions_select" ON practice_sessions FOR SELECT USING (
  user_id = auth.uid()
);

-- 6. page_views：创建不需要权限，查询需认证
DROP POLICY IF EXISTS "page_views_insert" ON page_views;
CREATE POLICY "page_views_insert" ON page_views FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "page_views_select" ON page_views;
CREATE POLICY "page_views_select" ON page_views FOR SELECT USING (
  auth.role() = 'authenticated'
);

-- 7. audit_logs：仅认证用户可以写和读
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (
  auth.role() = 'authenticated'
);
