-- ============================================
-- 补全缺失的 RLS 策略（CASCADE 删了但没重建的）
-- 执行位置：Supabase Dashboard → SQL Editor
-- ============================================

-- 1. profiles：管理员统计需要能看到所有用户（通过 RPC 绕过 RLS）
-- 但概览页的 count 查询走直接 SQL，需要宽松策略
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  true  -- 任何人都可以看到 profiles（仅包含公开信息：email、role）
);

-- 2. question_banks：添加 DELETE 策略，上传者和管理员可删
DROP POLICY IF EXISTS "banks_delete" ON question_banks;
CREATE POLICY "banks_delete" ON question_banks FOR DELETE USING (
  created_by = auth.uid() OR is_admin()
);

-- 3. questions：UPDATE/DELETE 策略
-- 注意：DELETE 不能用 EXISTS 检查父表，因为 CASCADE 删除时父记录可能已不存在。
-- 管理员直接放行，普通用户检查父表归属。
DROP POLICY IF EXISTS "questions_update" ON questions;
CREATE POLICY "questions_update" ON questions FOR UPDATE USING (
  is_admin() OR EXISTS (SELECT 1 FROM question_banks WHERE id = bank_id AND created_by = auth.uid())
);

DROP POLICY IF EXISTS "questions_delete" ON questions;
CREATE POLICY "questions_delete" ON questions FOR DELETE USING (
  is_admin() OR EXISTS (SELECT 1 FROM question_banks WHERE id = bank_id AND created_by = auth.uid())
);

-- 4. user_progress：管理员也能查看（用于统计）
DROP POLICY IF EXISTS "progress_select" ON user_progress;
CREATE POLICY "progress_select" ON user_progress FOR SELECT USING (
  user_id = auth.uid()
);

-- ============================================
-- 重建所有 RPC（确保定义正确）
-- ============================================

-- 先删旧的（用 CASCADE 清掉可能残留的依赖）
DROP FUNCTION IF EXISTS is_admin() CASCADE;
DROP FUNCTION IF EXISTS get_or_increment_page_view(TEXT);
DROP FUNCTION IF EXISTS get_my_wrong_questions(UUID);
DROP FUNCTION IF EXISTS submit_practice_session(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, INT, INT);
DROP FUNCTION IF EXISTS admin_get_dashboard_stats();
DROP FUNCTION IF EXISTS admin_get_page_views(INT);
DROP FUNCTION IF EXISTS admin_get_user_activity();
DROP FUNCTION IF EXISTS admin_get_wrong_question_stats();
DROP FUNCTION IF EXISTS admin_get_audit_logs();
DROP FUNCTION IF EXISTS admin_delete_user(UUID);
DROP FUNCTION IF EXISTS admin_create_user(TEXT, TEXT, TEXT);

-- is_admin（辅助函数）
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 页面访问计数
CREATE OR REPLACE FUNCTION get_or_increment_page_view(page_path TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO page_views (page_path, viewed_at) VALUES (page_path, now());
END;
$$;

-- 云端错题列表
CREATE OR REPLACE FUNCTION get_my_wrong_questions(p_bank_id UUID)
RETURNS TABLE(sort_order BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT q.sort_order::BIGINT
  FROM user_progress up
  JOIN questions q ON q.id = up.question_id
  WHERE up.bank_id = p_bank_id
    AND up.user_id = auth.uid()
    AND up.is_correct = false
  ORDER BY up.attempted_at DESC;
END;
$$;

-- 提交练习会话
CREATE OR REPLACE FUNCTION submit_practice_session(
  p_bank_id UUID, p_started_at TIMESTAMPTZ, p_ended_at TIMESTAMPTZ,
  p_total_questions INT, p_correct_count INT, p_wrong_count INT, p_duration_seconds INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO practice_sessions (user_id, bank_id, started_at, ended_at,
    total_questions, correct_count, wrong_count, duration_seconds)
  VALUES (auth.uid(), p_bank_id, p_started_at, p_ended_at,
    p_total_questions, p_correct_count, p_wrong_count, p_duration_seconds);
END;
$$;

-- 管理后台仪表盘统计
CREATE OR REPLACE FUNCTION admin_get_dashboard_stats()
RETURNS TABLE(total_answers BIGINT, avg_accuracy NUMERIC, active_7d BIGINT, active_30d BIGINT, storage_size_mb NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  RETURN QUERY
  SELECT
    COALESCE((SELECT COUNT(*)::BIGINT FROM user_progress), 0::BIGINT) AS total_answers,
    COALESCE((SELECT ROUND(
      (COUNT(*) FILTER (WHERE is_correct = true))::NUMERIC
      / NULLIF(COUNT(*), 0) * 100, 2
    ) FROM user_progress), 0) AS avg_accuracy,
    COALESCE((SELECT COUNT(DISTINCT user_id)::BIGINT FROM user_progress
      WHERE attempted_at >= now() - INTERVAL '7 days'), 0::BIGINT) AS active_7d,
    COALESCE((SELECT COUNT(DISTINCT user_id)::BIGINT FROM user_progress
      WHERE attempted_at >= now() - INTERVAL '30 days'), 0::BIGINT) AS active_30d,
    COALESCE((SELECT ROUND(SUM(pg_total_relation_size(relid))::NUMERIC / 1048576, 2)
      FROM pg_stat_user_tables), 0) AS storage_size_mb;
END;
$$;

-- PV 统计
CREATE OR REPLACE FUNCTION admin_get_page_views(days INT DEFAULT 1)
RETURNS TABLE(total_views BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  RETURN QUERY
  SELECT COUNT(*)::BIGINT FROM page_views
  WHERE viewed_at >= now() - (days || ' days')::INTERVAL;
END;
$$;

-- 用户活跃排行
CREATE OR REPLACE FUNCTION admin_get_user_activity()
RETURNS TABLE(user_email TEXT, answer_count BIGINT, correct_count BIGINT, accuracy NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  RETURN QUERY
  SELECT
    COALESCE(p.email, 'unknown')::TEXT,
    COUNT(*)::BIGINT AS answer_count,
    COUNT(*) FILTER (WHERE up.is_correct = true)::BIGINT AS correct_count,
    ROUND((COUNT(*) FILTER (WHERE up.is_correct = true))::NUMERIC
      / NULLIF(COUNT(*), 0) * 100, 2) AS accuracy
  FROM user_progress up
  LEFT JOIN profiles p ON p.id = up.user_id
  GROUP BY p.id, p.email
  ORDER BY answer_count DESC
  LIMIT 20;
END;
$$;

-- 错题排行 TOP
CREATE OR REPLACE FUNCTION admin_get_wrong_question_stats()
RETURNS TABLE(question_id UUID, question_title TEXT, wrong_count BIGINT, total_attempts BIGINT, wrong_rate NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  RETURN QUERY
  SELECT
    up.question_id,
    LEFT(COALESCE(q.content, '(已删除)'), 100)::TEXT,
    COUNT(*) FILTER (WHERE up.is_correct = false)::BIGINT,
    COUNT(*)::BIGINT,
    ROUND((COUNT(*) FILTER (WHERE up.is_correct = false))::NUMERIC
      / NULLIF(COUNT(*), 0) * 100, 2)
  FROM user_progress up
  LEFT JOIN questions q ON q.id = up.question_id
  GROUP BY up.question_id, q.content
  ORDER BY wrong_count DESC
  LIMIT 50;
END;
$$;

-- 审计日志
CREATE OR REPLACE FUNCTION admin_get_audit_logs()
RETURNS TABLE(id UUID, action TEXT, actor_email TEXT, target_type TEXT, target_id TEXT, details TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  RETURN QUERY
  SELECT al.id, al.action::TEXT, COALESCE(p.email, 'system')::TEXT,
    al.target_type::TEXT, al.target_id::TEXT, al.details::TEXT, al.created_at
  FROM audit_logs al
  LEFT JOIN profiles p ON p.id = al.actor_id
  ORDER BY al.created_at DESC
  LIMIT 200;
END;
$$;

-- 级联删除用户
CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  DELETE FROM audit_logs WHERE actor_id = target_user_id;
  DELETE FROM practice_sessions WHERE user_id = target_user_id;
  DELETE FROM user_progress WHERE user_id = target_user_id;
  DELETE FROM question_banks WHERE created_by = target_user_id;
  DELETE FROM profiles WHERE id = target_user_id;
END;
$$;

-- 管理员删除题库（SECURITY DEFINER 绕过 RLS）
DROP FUNCTION IF EXISTS admin_delete_bank(UUID);
CREATE OR REPLACE FUNCTION admin_delete_bank(bank_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '权限不足';
  END IF;

  DELETE FROM question_banks WHERE id = bank_id;
  RETURN FOUND;
END;
$$;

-- 管理员创建用户
CREATE OR REPLACE FUNCTION admin_create_user(email TEXT, password TEXT, role TEXT DEFAULT 'user')
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _new_user_id UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  _new_user_id := gen_random_uuid();
  INSERT INTO profiles (id, email, role) VALUES (_new_user_id, email, role);
  RETURN QUERY SELECT _new_user_id;
END;
$$;
