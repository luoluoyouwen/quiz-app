-- ============================================
-- 修复管理员删除题库失败 — 补全所有缺失的 RLS 策略
-- 在 Supabase SQL Editor 中一次性执行
-- ============================================

-- 1. 确保 profiles 任何人都可读（is_admin() 依赖此表）
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);

-- 2. 题库删除：上传者 + 管理员
DROP POLICY IF EXISTS "banks_delete" ON question_banks;
CREATE POLICY "banks_delete" ON question_banks FOR DELETE USING (
  created_by = auth.uid() OR is_admin()
);

-- 3. 题目删除：管理员直接放行，普通用户检查父表归属
DROP POLICY IF EXISTS "questions_delete" ON questions;
CREATE POLICY "questions_delete" ON questions FOR DELETE USING (
  is_admin() OR EXISTS (SELECT 1 FROM question_banks WHERE id = bank_id AND created_by = auth.uid())
);

-- 4. 题目更新
DROP POLICY IF EXISTS "questions_update" ON questions;
CREATE POLICY "questions_update" ON questions FOR UPDATE USING (
  is_admin() OR EXISTS (SELECT 1 FROM question_banks WHERE id = bank_id AND created_by = auth.uid())
);

-- 5. user_progress 删除（CASCADE 从 questions 下来时需要）
DROP POLICY IF EXISTS "progress_delete" ON user_progress;
CREATE POLICY "progress_delete" ON user_progress FOR DELETE USING (
  is_admin() OR user_id = auth.uid()
);

-- 6. practice_sessions 删除（如果有关联需要清理）
DROP POLICY IF EXISTS "sessions_delete" ON practice_sessions;
CREATE POLICY "sessions_delete" ON practice_sessions FOR DELETE USING (
  is_admin() OR user_id = auth.uid()
);

-- 7. 验证 is_admin() 函数正确
DROP FUNCTION IF EXISTS is_admin() CASCADE;
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 8. 诊断：检查当前用户是否是管理员
-- SELECT auth.uid() AS current_user_id, is_admin() AS is_admin;
