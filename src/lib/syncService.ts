import { supabase } from './supabase';
import { db } from '../db';

export interface ProgressRecord {
  questionId: string;
  bankId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeTaken: number;
}

/**
 * 批量提交一局练习的进度
 * 在线：直接批量 INSERT 到 Supabase，同时缓存到 Dexie
 * 离线：缓存到 Dexie，标记 pending
 */
export async function submitPracticeProgress(
  records: ProgressRecord[],
  userId: string,
): Promise<{ synced: number }> {
  if (records.length === 0) return { synced: 0 };

  const online = navigator.onLine;
  const now = new Date();

  if (online) {
    // 在线：批量写入 Supabase
    const rows = records.map(r => ({
      user_id: userId,
      question_id: r.questionId,
      bank_id: r.bankId,
      user_answer: r.userAnswer,
      is_correct: r.isCorrect,
      time_taken: r.timeTaken,
      attempted_at: now.toISOString(),
    }));

    const { error } = await supabase
      .from('user_progress')
      .insert(rows);

    if (error) {
      console.warn('Supabase 批量写入失败，转为离线缓存:', error.message);
      await cacheRecords(records, userId, 'pending');
    } else {
      await cacheRecords(records, userId, 'synced');
    }
  } else {
    // 离线：写入 Dexie 待同步
    await cacheRecords(records, userId, 'pending');
  }

  return { synced: records.length };
}

async function cacheRecords(
  records: ProgressRecord[],
  userId: string,
  syncStatus: 'pending' | 'synced',
): Promise<void> {
  const now = new Date();
  for (const r of records) {
    await db.userProgress.put({
      userId,
      questionId: r.questionId,
      bankId: r.bankId,
      userAnswer: r.userAnswer,
      isCorrect: r.isCorrect,
      timeTaken: r.timeTaken,
      syncStatus,
      attemptedAt: now,
    });
  }
}

/**
 * 从 Supabase 拉取某题库的最新进度
 * 多端合并：按 question_id + attempted_at DESC 取最新
 */
export async function fetchBankProgress(
  userId: string,
  bankId: string,
): Promise<Map<string, { isCorrect: boolean; userAnswer: string }>> {
  const { data, error } = await supabase
    .from('user_progress')
    .select('question_id, is_correct, user_answer, attempted_at')
    .eq('user_id', userId)
    .eq('bank_id', bankId)
    .order('question_id', { ascending: true })
    .order('attempted_at', { ascending: false });

  if (error) throw new Error(`拉取进度失败: ${error.message}`);

  // 按 question_id 去重取最新（DISTINCT ON 的客户端实现）
  const latest = new Map<string, { isCorrect: boolean; userAnswer: string }>();
  for (const record of data || []) {
    if (!latest.has(record.question_id)) {
      latest.set(record.question_id, {
        isCorrect: record.is_correct,
        userAnswer: record.user_answer,
      });
    }
  }
  return latest;
}

/**
 * 同步本地 pending 记录到 Supabase
 */
export async function syncPendingProgress(userId: string): Promise<number> {
  const pending = await db.userProgress
    .where('syncStatus')
    .equals('pending')
    .toArray();

  if (pending.length === 0) return 0;

  const rows = pending.map(r => ({
    user_id: userId,
    question_id: r.questionId,
    bank_id: r.bankId,
    user_answer: r.userAnswer,
    is_correct: r.isCorrect,
    time_taken: r.timeTaken,
    attempted_at: r.attemptedAt.toISOString(),
  }));

  const { error } = await supabase
    .from('user_progress')
    .insert(rows);

  if (error) {
    console.warn('批量同步失败:', error.message);
    return 0;
  }

  // 标记全部为已同步
  const ids = pending.map(r => r.id!).filter(Boolean);
  if (ids.length > 0) {
    await db.userProgress.where('id').anyOf(ids).modify({ syncStatus: 'synced' });
  }

  return pending.length;
}

/**
 * 注册自动同步（联网时回写 pending 记录）
 */
export function registerAutoSync(userId: string): () => void {
  const handler = async () => {
    if (navigator.onLine && userId) {
      const count = await syncPendingProgress(userId);
      if (count > 0) {
        console.log(`自动同步 ${count} 条离线进度`);
      }
    }
  };

  window.addEventListener('online', handler);
  // 启动时也尝试一次
  handler();

  return () => window.removeEventListener('online', handler);
}

/**
 * 页面关闭/离开时的兜底提交（使用 sendBeacon 确保请求完成）
 * 绕过 supabase-js 客户端，直接 POST 到 Supabase REST API
 */
export function submitProgressBeacon(
  records: ProgressRecord[],
  userId: string,
): boolean {
  if (records.length === 0 || !navigator.sendBeacon) return false;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !apiKey) return false;

  const rows = records.map(r => ({
    user_id: userId,
    question_id: r.questionId,
    bank_id: r.bankId,
    user_answer: r.userAnswer,
    is_correct: r.isCorrect,
    time_taken: r.timeTaken,
    attempted_at: new Date().toISOString(),
  }));

  const blob = new Blob([JSON.stringify(rows)], { type: 'application/json' });
  return navigator.sendBeacon(
    `${supabaseUrl}/rest/v1/user_progress`,
    blob,
  );
}
