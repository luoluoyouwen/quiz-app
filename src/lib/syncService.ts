import { supabase } from './supabase';
import { debug } from '../utils/debug';

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
      debug.warn('Supabase 批量写入失败，转为离线缓存:', error.message);
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
  const { db } = await import('../db');
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
  const { db } = await import('../db');
  const pending = await db.userProgress
    .where('syncStatus')
    .equals('pending')
    .filter(r => r.userId === userId)
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
    debug.warn('批量同步失败:', error.message);
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
        debug.log(`自动同步 ${count} 条离线进度`);
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
 *
 * sendBeacon 无法设置自定义 HTTP 头，因此不能直接 POST 到 Supabase
 *（需要 apikey + Authorization）。改用 Cloudflare Pages Function 代理
 * 路径 /api/progress-beacon，由服务端注入认证头后转发到 Supabase。
 */
export async function submitProgressBeacon(
  records: ProgressRecord[],
  userId: string,
): Promise<boolean> {
  if (records.length === 0) return false;

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return false;

  const rows = records.map(r => ({
    user_id: userId,
    question_id: r.questionId,
    bank_id: r.bankId,
    user_answer: r.userAnswer,
    is_correct: r.isCorrect,
    time_taken: r.timeTaken,
    attempted_at: new Date().toISOString(),
  }));

  const body = JSON.stringify(rows);

  // Use CF Pages Function proxy — it injects SERVICE_ROLE_KEY for auth
  try {
    const response = await fetch('/api/progress-beacon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body,
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 从 Supabase 拉取云端题库的完整练习记录，按时间分组为"会话"
 * 每次提交的一组题目（30 分钟内）视为一次练习会话
 */
export interface CloudSession {
  id: number;
  bankId: string;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  date: Date;
}

export async function fetchCloudSessions(
  userId: string,
  bankId: string,
): Promise<CloudSession[]> {
  const { data, error } = await supabase
    .from('user_progress')
    .select('is_correct, attempted_at')
    .eq('user_id', userId)
    .eq('bank_id', bankId)
    .order('attempted_at', { ascending: true });

  if (error) throw new Error(`拉取云端练习记录失败: ${error.message}`);
  if (!data || data.length === 0) return [];

  // 按时间邻近分组：30 分钟内连续提交视为同一会话
  const grouped: { correct: number; wrong: number; date: Date }[] = [];
  let curCorrect = 0;
  let curWrong = 0;
  let curDate = new Date(data[0].attempted_at);

  for (const record of data) {
    const d = new Date(record.attempted_at);
    if (d.getTime() - curDate.getTime() > 30 * 60 * 1000) {
      grouped.push({ correct: curCorrect, wrong: curWrong, date: curDate });
      curCorrect = 0;
      curWrong = 0;
      curDate = d;
    }
    if (record.is_correct) curCorrect++;
    else curWrong++;
  }
  grouped.push({ correct: curCorrect, wrong: curWrong, date: curDate });

  return grouped.map((s, i) => ({
    id: i + 1,
    bankId,
    totalQuestions: s.correct + s.wrong,
    correctAnswers: s.correct,
    wrongAnswers: s.wrong,
    startedAt: s.date,
    score: s.correct + s.wrong > 0
      ? Math.round((s.correct / (s.correct + s.wrong)) * 100)
      : 0,
    date: s.date,
  }));
}
