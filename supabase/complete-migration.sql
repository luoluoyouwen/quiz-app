-- ============================================
-- 刷题 App — 完整 Supabase 建表 + RPC 迁移
-- 用途：一次性执行，创建所有缺失的表和 RPC
-- 安全：所有语句均带 IF NOT EXISTS / OR REPLACE
-- 可重复执行，不会破坏已有数据
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴运行
-- ============================================

-- ============================================
-- 第一部分：建表
-- ============================================

-- 1. 用户扩展信息表（Supabase 创建 users 触发器时通常自动创建）
--    如果已存在则只补充缺失字段
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  can_upload BOOLEAN DEFAULT false,
  upload_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 修复：如果 profiles 表已存在但缺少字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_upload BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS upload_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 2. 题库表（主表）
CREATE TABLE IF NOT EXISTS question_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  content_hash TEXT,
  created_by UUID REFERENCES profiles(id),
  question_count INT DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS question_count INT DEFAULT 0;
ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_banks_review_status ON question_banks(review_status);
CREATE INDEX IF NOT EXISTS idx_banks_created_by ON question_banks(created_by);

-- 3. 题目表
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id UUID NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('choice','multi','fill','judge','essay','nofill')),
  content TEXT NOT NULL,
  options JSONB,
  answer TEXT NOT NULL DEFAULT '',
  answers JSONB,
  explanation TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS options JSONB;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS answers JSONB;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS bank_id UUID;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_questions_bank_id ON questions(bank_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);

-- 4. 用户刷题进度表（核心同步表）
CREATE TABLE IF NOT EXISTS user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  bank_id UUID NOT NULL,
  user_answer TEXT,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  time_taken INT DEFAULT 0,
  attempted_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS question_id UUID;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS bank_id UUID;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS user_answer TEXT;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS is_correct BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS time_taken INT DEFAULT 0;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_progress_user_bank ON user_progress(user_id, bank_id);
CREATE INDEX IF NOT EXISTS idx_progress_user_question ON user_progress(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_progress_attempted ON user_progress(attempted_at);

-- 5. 练习会话表（统计用）
CREATE TABLE IF NOT EXISTS practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  total_questions INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS bank_id UUID;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS total_questions INT NOT NULL DEFAULT 0;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS correct_count INT NOT NULL DEFAULT 0;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS wrong_count INT NOT NULL DEFAULT 0;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_user_bank ON practice_sessions(user_id, bank_id);

-- 6. 页面访问日志表
CREATE TABLE IF NOT EXISTS page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT NOT NULL,
  viewed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE page_views ADD COLUMN IF NOT EXISTS page_path TEXT;
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_page_views_at ON page_views(viewed_at);

-- 7. 审计日志表（管理后台操作记录）
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================
-- 第二部分：RLS 策略
-- ============================================

-- 启用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- profiles：用户只能看自己的，管理员看全部
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  id = auth.uid() OR is_admin()
);
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- question_banks：已审核的公开，pending/rejected 仅上传者和管理员可见
DROP POLICY IF EXISTS "banks_select" ON question_banks;
CREATE POLICY "banks_select" ON question_banks FOR SELECT USING (
  review_status = 'approved'
  OR created_by = auth.uid()
  OR is_admin()
);
DROP POLICY IF EXISTS "banks_insert" ON question_banks;
CREATE POLICY "banks_insert" ON question_banks FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);
DROP POLICY IF EXISTS "banks_update" ON question_banks;
CREATE POLICY "banks_update" ON question_banks FOR UPDATE USING (
  created_by = auth.uid() OR is_admin()
);

-- questions：题库可见即可见题目
DROP POLICY IF EXISTS "questions_select" ON questions;
CREATE POLICY "questions_select" ON questions FOR SELECT USING (
  EXISTS (SELECT 1 FROM question_banks WHERE id = bank_id)
);
DROP POLICY IF EXISTS "questions_insert" ON questions;
CREATE POLICY "questions_insert" ON questions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM question_banks WHERE id = bank_id AND created_by = auth.uid())
  OR is_admin()
);

-- user_progress：用户只能看/写自己的进度
DROP POLICY IF EXISTS "progress_select" ON user_progress;
CREATE POLICY "progress_select" ON user_progress FOR SELECT USING (
  user_id = auth.uid() OR is_admin()
);
DROP POLICY IF EXISTS "progress_insert" ON user_progress;
CREATE POLICY "progress_insert" ON user_progress FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
DROP POLICY IF EXISTS "progress_update" ON user_progress;
CREATE POLICY "progress_update" ON user_progress FOR UPDATE USING (
  user_id = auth.uid()
);

-- practice_sessions：用户只能看自己的会话
DROP POLICY IF EXISTS "sessions_select" ON practice_sessions;
CREATE POLICY "sessions_select" ON practice_sessions FOR SELECT USING (
  user_id = auth.uid() OR is_admin()
);
DROP POLICY IF EXISTS "sessions_insert" ON practice_sessions;
CREATE POLICY "sessions_insert" ON practice_sessions FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

-- page_views：任何人都可以插入，管理员可以查询
DROP POLICY IF EXISTS "page_views_insert" ON page_views;
CREATE POLICY "page_views_insert" ON page_views FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "page_views_select" ON page_views;
CREATE POLICY "page_views_select" ON page_views FOR SELECT USING (is_admin());

-- audit_logs：仅管理员可读写
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (is_admin());

-- ============================================
-- 第三部分：RPC 函数
-- 注意：先删旧函数再重建（避免 42P13 返回类型冲突）
-- is_admin CASCADE 是因为已有 RLS 策略引用了它
-- ============================================

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
DROP FUNCTION IF EXISTS is_admin() CASCADE;

-- 辅助函数：判断管理员
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

-- 1. 访问量计数
CREATE OR REPLACE FUNCTION get_or_increment_page_view(page_path TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO page_views (page_path, viewed_at) VALUES (page_path, now());
END;
$$;

-- 2. 获取当前用户在某题库的错题 sort_order 列表
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

-- 3. 提交练习会话
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

-- 4. 管理后台仪表盘
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
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  RETURN QUERY
  SELECT
    COALESCE((SELECT COUNT(*)::BIGINT FROM user_progress), 0::BIGINT) AS total_answers,
    COALESCE(
      (SELECT ROUND(
        (COUNT(*) FILTER (WHERE is_correct = true))::NUMERIC
        / NULLIF(COUNT(*), 0) * 100, 2
      ) FROM user_progress), 0
    ) AS avg_accuracy,
    COALESCE(
      (SELECT COUNT(DISTINCT user_id)::BIGINT FROM user_progress
       WHERE attempted_at >= now() - INTERVAL '7 days'), 0::BIGINT
    ) AS active_7d,
    COALESCE(
      (SELECT COUNT(DISTINCT user_id)::BIGINT FROM user_progress
       WHERE attempted_at >= now() - INTERVAL '30 days'), 0::BIGINT
    ) AS active_30d,
    COALESCE(
      (SELECT ROUND(SUM(pg_total_relation_size(relid))::NUMERIC / 1048576, 2)
       FROM pg_stat_user_tables), 0
    ) AS storage_size_mb;
END;
$$;

-- 5. PV 统计
CREATE OR REPLACE FUNCTION admin_get_page_views(days INT DEFAULT 1)
RETURNS TABLE(total_views BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  RETURN QUERY
  SELECT COUNT(*)::BIGINT AS total_views
  FROM page_views
  WHERE viewed_at >= now() - (days || ' days')::INTERVAL;
END;
$$;

-- 6. 用户活跃排行
CREATE OR REPLACE FUNCTION admin_get_user_activity()
RETURNS TABLE(user_email TEXT, answer_count BIGINT, correct_count BIGINT, accuracy NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  RETURN QUERY
  SELECT
    COALESCE(p.email, 'unknown')::TEXT AS user_email,
    COUNT(*)::BIGINT AS answer_count,
    COUNT(*) FILTER (WHERE up.is_correct = true)::BIGINT AS correct_count,
    ROUND(
      (COUNT(*) FILTER (WHERE up.is_correct = true))::NUMERIC
      / NULLIF(COUNT(*), 0) * 100, 2
    ) AS accuracy
  FROM user_progress up
  LEFT JOIN profiles p ON p.id = up.user_id
  GROUP BY p.id, p.email
  ORDER BY answer_count DESC
  LIMIT 20;
END;
$$;

-- 7. 错题排行 TOP
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
    LEFT(COALESCE(q.content, '(已删除)'), 100)::TEXT AS question_title,
    COUNT(*) FILTER (WHERE up.is_correct = false)::BIGINT AS wrong_count,
    COUNT(*)::BIGINT AS total_attempts,
    ROUND(
      (COUNT(*) FILTER (WHERE up.is_correct = false))::NUMERIC
      / NULLIF(COUNT(*), 0) * 100, 2
    ) AS wrong_rate
  FROM user_progress up
  LEFT JOIN questions q ON q.id = up.question_id
  GROUP BY up.question_id, q.content
  ORDER BY wrong_count DESC
  LIMIT 50;
END;
$$;

-- 8. 审计日志
CREATE OR REPLACE FUNCTION admin_get_audit_logs()
RETURNS TABLE(id UUID, action TEXT, actor_email TEXT, target_type TEXT, target_id TEXT, details TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  RETURN QUERY
  SELECT
    al.id,
    al.action::TEXT,
    COALESCE(p.email, 'system')::TEXT AS actor_email,
    al.target_type::TEXT,
    al.target_id::TEXT,
    al.details::TEXT,
    al.created_at
  FROM audit_logs al
  LEFT JOIN profiles p ON p.id = al.actor_id
  ORDER BY al.created_at DESC
  LIMIT 200;
END;
$$;

-- 9. 级联删除用户
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

-- 10. 管理员创建用户（轻量版：仅创建 profile 记录）
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
  RETURN QUERY SELECT _new_user_id AS user_id;
END;
$$;
