-- ============================================
-- P5 补丁：nofill 类型支持
-- 日期：2026-06-23
-- 说明：questions 表的 CHECK 约束增加 'nofill' 类型
--       同时修复已上传数据：将原被转为 fill 的 nofill 题改回来
-- ============================================

-- 1. 更新 CHECK 约束，增加 nofill
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('choice','multi','fill','judge','essay','nofill'));

-- 2. 修复已有数据：找到云端题库中实际内容无空格的 fill 题，改回 nofill
-- 规则：type='fill' 且 content 不含 '____' → 本应是 nofill
UPDATE questions
SET type = 'nofill'
WHERE type = 'fill'
  AND content NOT LIKE '%____%';
