-- ============================================
-- 刷题 App — Supabase RPC 函数定义
-- 用途：数据库重建后需执行此文件恢复所有 RPC
-- 注意：这些函数定义从前端调用推断而来，
--       部分函数可能需要根据实际 Supabase 项目
--       的 schema 微调。
-- 最后更新：2026-06-24
-- ============================================

-- ============================================
-- 用户端 RPC
-- ============================================

-- 1. 访问量计数（页面级别、2秒防抖）
CREATE OR REPLACE FUNCTION get_or_increment_page_view(page_path TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO page_views (page_path, viewed_at)
  VALUES (page_path, now());
END;
$$;

-- 2. 获取当前用户的云端错题（按题库）
-- 返回该用户在当前题库中答错过的题目 sort_order 列表
-- 前端通过 sort_order 映射回云端题目
CREATE OR REPLACE FUNCTION get_my_wrong_questions(p_bank_id UUID)
RETURNS TABLE(sort_order BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT q.sort_order
  FROM user_progress up
  JOIN questions q ON q.id = up.question_id
  WHERE up.bank_id = p_bank_id
    AND up.user_id = auth.uid()
    AND up.is_correct = false
  ORDER BY up.attempted_at DESC;
END;
$$;

-- 3. 提交练习会话（成绩汇总）
CREATE OR REPLACE FUNCTION submit_practice_session(
  p_bank_id UUID,
  p_started_at TIMESTAMPTZ,
  p_ended_at TIMESTAMPTZ,
  p_total_questions INT,
  p_correct_count INT,
  p_wrong_count INT,
  p_duration_seconds INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO practice_sessions (
    user_id, bank_id, started_at, ended_at,
    total_questions, correct_count, wrong_count, duration_seconds
  ) VALUES (
    auth.uid(), p_bank_id, p_started_at, p_ended_at,
    p_total_questions, p_correct_count, p_wrong_count, p_duration_seconds
  );
END;
$$;

-- ============================================
-- 管理后台 RPC（仅 admin 可执行）
-- ============================================

-- 4. 管理后台仪表盘统计
CREATE OR REPLACE FUNCTION admin_get_dashboard_stats()
RETURNS TABLE(
  total_answers BIGINT,
  avg_accuracy NUMERIC,
  active_7d BIGINT,
  active_30d BIGINT,
  storage_size_mb NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _is_admin BOOLEAN;
BEGIN
  -- 权限检查
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION '权限不足';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((SELECT COUNT(*) FROM user_progress), 0)::BIGINT AS total_answers,
    COALESCE(
      (SELECT ROUND(
        (COUNT(*) FILTER (WHERE is_correct = true))::NUMERIC
        / NULLIF(COUNT(*), 0) * 100, 2
      ) FROM user_progress),
      0
    ) AS avg_accuracy,
    COALESCE(
      (SELECT COUNT(DISTINCT user_id) FROM user_progress
       WHERE attempted_at >= now() - INTERVAL '7 days'),
      0
    )::BIGINT AS active_7d,
    COALESCE(
      (SELECT COUNT(DISTINCT user_id) FROM user_progress
       WHERE attempted_at >= now() - INTERVAL '30 days'),
      0
    )::BIGINT AS active_30d,
    COALESCE(
      (SELECT ROUND(SUM(pg_total_relation_size(relid))::NUMERIC / 1048576, 2)
       FROM pg_stat_user_tables),
      0
    ) AS storage_size_mb;
END;
$$;

-- 5. 管理后台 PV 统计
CREATE OR REPLACE FUNCTION admin_get_page_views(days INT DEFAULT 1)
RETURNS TABLE(total_views BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION '权限不足';
  END IF;

  RETURN QUERY
  SELECT COUNT(*)::BIGINT AS total_views
  FROM page_views
  WHERE viewed_at >= now() - (days || ' days')::INTERVAL;
END;
$$;

-- 6. 用户活跃排行
CREATE OR REPLACE FUNCTION admin_get_user_activity()
RETURNS TABLE(
  user_email TEXT,
  answer_count BIGINT,
  correct_count BIGINT,
  accuracy NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION '权限不足';
  END IF;

  RETURN QUERY
  SELECT
    p.email AS user_email,
    COUNT(*)::BIGINT AS answer_count,
    COUNT(*) FILTER (WHERE up.is_correct = true)::BIGINT AS correct_count,
    ROUND(
      (COUNT(*) FILTER (WHERE up.is_correct = true))::NUMERIC
      / NULLIF(COUNT(*), 0) * 100, 2
    ) AS accuracy
  FROM user_progress up
  JOIN profiles p ON p.id = up.user_id
  GROUP BY p.id, p.email
  ORDER BY answer_count DESC
  LIMIT 20;
END;
$$;

-- 7. 错题排行 TOP
CREATE OR REPLACE FUNCTION admin_get_wrong_question_stats()
RETURNS TABLE(
  question_id UUID,
  question_title TEXT,
  wrong_count BIGINT,
  total_attempts BIGINT,
  wrong_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION '权限不足';
  END IF;

  RETURN QUERY
  SELECT
    up.question_id,
    LEFT(q.content, 100) AS question_title,
    COUNT(*) FILTER (WHERE up.is_correct = false)::BIGINT AS wrong_count,
    COUNT(*)::BIGINT AS total_attempts,
    ROUND(
      (COUNT(*) FILTER (WHERE up.is_correct = false))::NUMERIC
      / NULLIF(COUNT(*), 0) * 100, 2
    ) AS wrong_rate
  FROM user_progress up
  JOIN questions q ON q.id = up.question_id
  GROUP BY up.question_id, q.content
  ORDER BY wrong_count DESC
  LIMIT 50;
END;
$$;

-- 8. 审计日志
CREATE OR REPLACE FUNCTION admin_get_audit_logs()
RETURNS TABLE(
  id UUID,
  action TEXT,
  actor_email TEXT,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION '权限不足';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.action,
    p.email AS actor_email,
    al.target_type,
    al.target_id,
    al.details,
    al.created_at
  FROM audit_logs al
  LEFT JOIN profiles p ON p.id = al.actor_id
  ORDER BY al.created_at DESC
  LIMIT 200;
END;
$$;

-- 9. 级联删除用户（管理员）
CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION '权限不足';
  END IF;

  -- 级联删除
  DELETE FROM audit_logs WHERE actor_id = target_user_id;
  DELETE FROM practice_sessions WHERE user_id = target_user_id;
  DELETE FROM user_progress WHERE user_id = target_user_id;
  DELETE FROM question_banks WHERE created_by = target_user_id;
  DELETE FROM profiles WHERE id = target_user_id;
  -- 注意：auth.users 中的用户需通过 Auth Admin API 删除
  -- 参见 functions/api/admin/reset-password.ts 的模式
END;
$$;

-- 10. 管理员重置密码（前端通过 CF Function + SERVICE_ROLE_KEY 实现）
-- 见 functions/api/admin/reset-password.ts
-- 该功能不使用 RPC，直接调用 Supabase Auth Admin API
-- 所以此处无需 CREATE FUNCTION

-- 11. 管理员创建用户
CREATE OR REPLACE FUNCTION admin_create_user(
  email TEXT,
  password TEXT,
  role TEXT DEFAULT 'user'
)
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _is_admin BOOLEAN;
  _new_user_id UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION '权限不足';
  END IF;

  -- 通过 auth 管理 API 创建用户（需 service_role）
  -- 此 RPC 实际由 Cloudflare Function 以 SERVICE_ROLE_KEY 调用
  -- 见 functions/api/admin/reset-password.ts 的模式

  INSERT INTO profiles (id, email, role)
  VALUES (gen_random_uuid(), email, role)
  RETURNING id INTO _new_user_id;

  RETURN QUERY SELECT _new_user_id AS user_id;
END;
$$;

-- ============================================
-- 辅助函数
-- ============================================

-- 判断当前用户是否为管理员
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
