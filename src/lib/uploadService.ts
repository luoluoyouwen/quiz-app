import { supabase } from './supabase';
import type { QuestionInput } from '../utils/parsers';

interface UploadResult {
  bankId: string;  // Supabase UUID
  questionCount: number;
}

/**
 * 上传题库到 Supabase
 * 1. 创建 question_banks 记录（含 content_hash + review_status='pending'）
 * 2. 批量写入 questions（带 sort_order）
 * 3. 更新 question_banks.question_count
 */
export async function uploadBankToSupabase(
  name: string,
  description: string,
  questions: QuestionInput[],
  contentHash: string,
  supabaseUserId: string,
): Promise<UploadResult> {
  const questionCount = questions.length;

  // 1. 插入 question_banks（review_status = 'pending'，需管理员审核）
  const { data: bank, error: bankError } = await supabase
    .from('question_banks')
    .insert({
      name,
      description,
      content_hash: contentHash,
      created_by: supabaseUserId,
      question_count: questionCount,
      review_status: 'pending',
    })
    .select('id')
    .single();

  if (bankError) throw new Error(`创建题库失败: ${bankError.message}`);
  if (!bank) throw new Error('创建题库失败：未返回数据');

  // 2. 批量插入 questions — 每次最多 500 条
  const questionRows = questions.map((q, i) => ({
    bank_id: bank.id,
    type: q.type,
    content: q.content,
    options: q.options || null,
    answer: q.answer,
    answers: q.answers || null,
    explanation: q.explanation || '',
    image_url: '',     // P4 处理图片上传
    sort_order: i + 1,
  }));

  const BATCH_SIZE = 500;
  for (let i = 0; i < questionRows.length; i += BATCH_SIZE) {
    const batch = questionRows.slice(i, i + BATCH_SIZE);
    const { error: questionsError } = await supabase
      .from('questions')
      .insert(batch);

    if (questionsError) throw new Error(`写入题目失败 (第 ${i + 1}~${i + batch.length} 题): ${questionsError.message}`);
  }

  return { bankId: bank.id, questionCount };
}

/**
 * 检查 content_hash 是否已存在
 */
export async function checkHashExists(contentHash: string): Promise<{ exists: boolean; bankName?: string }> {
  const { data } = await supabase
    .from('question_banks')
    .select('name')
    .eq('content_hash', contentHash)
    .maybeSingle();

  if (data) {
    return { exists: true, bankName: data.name };
  }
  return { exists: false };
}

/**
 * 根据 content_hash 获取云端题库信息
 */
export async function getBankByHash(contentHash: string): Promise<{
  id: string;
  name: string;
  description: string;
  question_count: number;
} | null> {
  const { data } = await supabase
    .from('question_banks')
    .select('id, name, description, question_count')
    .eq('content_hash', contentHash)
    .maybeSingle();

  return data;
}

/**
 * 从 Supabase 拉取云题库的题目并缓存到本地 Dexie
 */
export async function syncCloudBankToLocal(
  bankId: string,
  bankName: string,
  localDexieBankId?: number,
): Promise<number> {
  const { data: questions, error } = await supabase
    .from('questions')
    .select('*')
    .eq('bank_id', bankId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`拉取云端题目失败: ${error.message}`);
  if (!questions || questions.length === 0) return 0;

  // 获取或创建本地 Dexie 题库
  const { db } = await import('../db');
  let localBankId = localDexieBankId;

  if (!localBankId) {
    // 先按 description 中的 cloud UUID 查找
    const existingByUuid = await db.banks
      .filter(b => b.description === `☁️ ${bankId}`)
      .first();

    if (existingByUuid) {
      localBankId = existingByUuid.id!;
    } else {
      localBankId = await db.banks.add({
        name: bankName,
        description: `☁️ ${bankId}`,  // 存储 cloud UUID，离线时可反查
        createdAt: new Date(),
      });
    }
  }

  // 检查本地是否已有这些题目（按 content 去重）
  const existingQuestions = await db.questions
    .where('bankId')
    .equals(localBankId!)
    .toArray();

  const existingContents = new Set(existingQuestions.map(q => q.content));

  const toAdd = questions
    .map(q => ({
      bankId: localBankId!,
      type: q.type,
      content: q.content,
      options: q.options || undefined,
      answer: q.answer,
      answers: q.answers || undefined,
      explanation: q.explanation || undefined,
      cloudId: q.id,  // 保留 Supabase 题目 UUID，用于离线进度回写
    }))
    .filter(q => !existingContents.has(q.content));

  if (toAdd.length > 0 && localBankId) {
    await db.questions.bulkAdd(toAdd as any);
  }

  return toAdd.length;
}

/**
 * 判断 ID 是否为云端 UUID 格式
 */
export function isCloudId(id: string | number): boolean {
  if (typeof id === 'string' && id.includes('-')) return true;
  return false;
}

/**
 * 获取当前用户可见的云端题库（approved + 自己的 pending）
 */
export async function fetchVisibleBanks(userId?: string): Promise<any[]> {
  if (!userId) {
    // 未登录：只显示 approved
    const { data } = await supabase
      .from('question_banks')
      .select('*')
      .eq('review_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(50);
    return data || [];
  }

  // 已登录：approved + 自己上传的
  const { data } = await supabase
    .from('question_banks')
    .select('*')
    .or(`review_status.eq.approved,created_by.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(50);
  return data || [];
}
