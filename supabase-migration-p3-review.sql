-- ============================================
-- P3 补充：题库审核机制
-- 日期：2026-06-23
-- 说明：所有登录用户均可上传题库，新上传标记 pending，
--       审核通过后才对全员可见。上传者本人始终可见自己的题库。
-- ============================================

-- 1. question_banks 加 review_status 字段
ALTER TABLE question_banks ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (review_status IN ('pending', 'approved', 'rejected'));

-- 2. 将已有题库全部标记为 approved（存量数据不受影响）
UPDATE question_banks SET review_status = 'approved' WHERE review_status IS NULL;

-- 3. 新增索引：管理员按状态查 pending 的题库
CREATE INDEX idx_banks_review_status ON question_banks(review_status);

-- 4. 更新 RLS：所有已认证用户均可创建题库
DROP POLICY IF EXISTS "banks_insert" ON question_banks;
CREATE POLICY "banks_insert" ON question_banks FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);

-- 5. 更新 RLS：可见性规则
--   - approved → 所有人可见
--   - pending/rejected → 仅上传者和 admin 可见
DROP POLICY IF EXISTS "banks_select" ON question_banks;
CREATE POLICY "banks_select" ON question_banks FOR SELECT USING (
  review_status = 'approved'
  OR created_by = auth.uid()
  OR is_admin()
);

-- 6. questions 的插入 RLS 也要相应调整：
-- 允许所有已认证用户向自己的 bank 插入题目
DROP POLICY IF EXISTS "questions_insert" ON questions;
CREATE POLICY "questions_insert" ON questions FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM question_banks
    WHERE id = bank_id AND created_by = auth.uid()
  )
  OR is_admin()
);
