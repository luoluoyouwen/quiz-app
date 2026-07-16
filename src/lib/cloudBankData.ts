import { db, type CloudBankCacheRecord, type QuestionType } from '../db';
import { supabase } from './supabase';

const MEMORY_CACHE_TTL = 5 * 60 * 1000;
const PERSISTENT_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const PERSISTENT_REVALIDATE_INTERVAL = 10 * 60 * 1000;
const SESSION_SCOPE = 'session';

export interface CloudQuestionData {
  id: string;
  bank_id: string;
  type: QuestionType;
  content: string;
  options: string[] | null;
  answer: string;
  answers: string[] | null;
  explanation: string;
  image_url: string;
  sort_order: number;
}

export interface CloudBankInfo {
  id: string;
  name: string;
  description: string;
  question_count: number;
  content_hash?: string | null;
  created_at?: string;
  created_by?: string;
}

export interface CloudBankData {
  bank: CloudBankInfo;
  questions: CloudQuestionData[];
}

export interface CloudBankLoadOptions {
  userId?: string;
  bankHint?: CloudBankInfo;
  onRevalidated?: (data: CloudBankData) => void;
}

interface MemoryCacheEntry {
  expiresAt: number;
  value: CloudBankData;
}

const memoryCache = new Map<string, MemoryCacheEntry>();
const loadInFlight = new Map<string, Promise<CloudBankData>>();
const refreshInFlight = new Map<string, Promise<CloudBankData | undefined>>();

function cacheKey(bankId: string, userId?: string): string {
  return (userId || SESSION_SCOPE) + '::' + bankId;
}

function isCloudBankData(value: unknown, bankId: string): value is CloudBankData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CloudBankData>;
  return candidate.bank?.id === bankId && Array.isArray(candidate.questions);
}

function remember(key: string, value: CloudBankData): void {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + MEMORY_CACHE_TTL,
  });
}

async function readPersistentCache(bankId: string, userId?: string): Promise<CloudBankCacheRecord | undefined> {
  if (!userId) return undefined;

  try {
    const record = await db.cloudBankCache.get(cacheKey(bankId, userId));
    if (!record) return undefined;
    if (Date.now() - record.cachedAt > PERSISTENT_CACHE_MAX_AGE || !isCloudBankData(record.data, bankId)) {
      void db.cloudBankCache.delete(record.key).catch(() => undefined);
      return undefined;
    }
    return record;
  } catch {
    return undefined;
  }
}

function writePersistentCache(
  bankId: string,
  userId: string | undefined,
  value: CloudBankData,
  validatedAt: number,
): void {
  if (!userId) return;

  const record: CloudBankCacheRecord = {
    key: cacheKey(bankId, userId),
    userId,
    bankId,
    data: value,
    cachedAt: Date.now(),
    validatedAt,
  };
  void db.cloudBankCache.put(record).catch(() => undefined);
}

function storeData(bankId: string, options: CloudBankLoadOptions, value: CloudBankData, validatedAt: number): void {
  remember(cacheKey(bankId, options.userId), value);
  writePersistentCache(bankId, options.userId, value, validatedAt);
}

function sameQuestionVersion(cached: CloudBankInfo, latest: CloudBankInfo): boolean {
  if (cached.question_count !== latest.question_count) return false;
  if (cached.content_hash && latest.content_hash) return cached.content_hash === latest.content_hash;
  return true;
}

async function fetchBankInfo(bankId: string): Promise<CloudBankInfo> {
  const result = await supabase
    .from('question_banks')
    .select('id, name, description, question_count, content_hash, created_at, created_by')
    .eq('id', bankId)
    .single();

  if (result.error || !result.data) {
    throw new Error('Failed to load cloud bank: ' + (result.error?.message || 'not found'));
  }
  return result.data as CloudBankInfo;
}

async function fetchQuestions(bankId: string): Promise<CloudQuestionData[]> {
  const result = await supabase
    .from('questions')
    .select('id, bank_id, type, content, options, answer, answers, explanation, image_url, sort_order')
    .eq('bank_id', bankId)
    .order('sort_order', { ascending: true });

  if (result.error) {
    throw new Error('Failed to load cloud questions: ' + result.error.message);
  }
  return (result.data || []) as CloudQuestionData[];
}

async function fetchFreshData(bankId: string, bankHint?: CloudBankInfo): Promise<CloudBankData> {
  const [bank, questions] = await Promise.all([
    bankHint ? Promise.resolve(bankHint) : fetchBankInfo(bankId),
    fetchQuestions(bankId),
  ]);
  return { bank, questions };
}

function startBackgroundRevalidation(
  bankId: string,
  record: CloudBankCacheRecord,
  options: CloudBankLoadOptions,
): void {
  if (!isCloudBankData(record.data, bankId)) return;
  if (!options.bankHint && Date.now() - record.validatedAt < PERSISTENT_REVALIDATE_INTERVAL) return;

  const key = cacheKey(bankId, options.userId);
  if (refreshInFlight.has(key)) return;
  const cached = record.data;

  const refresh = (async () => {
    const latestBank = options.bankHint || await fetchBankInfo(bankId);
    let value: CloudBankData;

    if (sameQuestionVersion(cached.bank, latestBank)) {
      value = {
        bank: { ...cached.bank, ...latestBank },
        questions: cached.questions,
      };
    } else {
      value = await fetchFreshData(bankId, latestBank);
    }

    storeData(bankId, options, value, Date.now());
    options.onRevalidated?.(value);
    return value;
  })().catch(() => undefined).finally(() => {
    refreshInFlight.delete(key);
  });

  refreshInFlight.set(key, refresh);
}

export function getCachedCloudBankData(bankId: string, userId?: string): CloudBankData | undefined {
  const key = cacheKey(bankId, userId);
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function loadCloudBankData(
  bankId: string,
  options: CloudBankLoadOptions = {},
): Promise<CloudBankData> {
  const key = cacheKey(bankId, options.userId);
  const cached = getCachedCloudBankData(bankId, options.userId);
  if (cached) return Promise.resolve(cached);

  const pending = loadInFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const persistent = await readPersistentCache(bankId, options.userId);
    if (persistent && isCloudBankData(persistent.data, bankId)) {
      remember(key, persistent.data);
      startBackgroundRevalidation(bankId, persistent, options);
      return persistent.data;
    }

    const value = await fetchFreshData(bankId, options.bankHint);
    storeData(bankId, options, value, Date.now());
    return value;
  })().finally(() => {
    loadInFlight.delete(key);
  });

  loadInFlight.set(key, request);
  return request;
}

export function prefetchCloudBankData(bankId: string, options: CloudBankLoadOptions = {}): void {
  void loadCloudBankData(bankId, options).catch(() => undefined);
}

export function clearCloudBankDataCache(userId?: string): void {
  if (!userId) {
    memoryCache.clear();
    loadInFlight.clear();
    refreshInFlight.clear();
    return;
  }

  const prefix = userId + '::';
  for (const key of memoryCache.keys()) if (key.startsWith(prefix)) memoryCache.delete(key);
  for (const key of loadInFlight.keys()) if (key.startsWith(prefix)) loadInFlight.delete(key);
  for (const key of refreshInFlight.keys()) if (key.startsWith(prefix)) refreshInFlight.delete(key);
}

export async function deletePersistentCloudBankDataCache(userId?: string): Promise<void> {
  clearCloudBankDataCache(userId);
  try {
    if (userId) {
      await db.cloudBankCache.where('userId').equals(userId).delete();
    } else {
      await db.cloudBankCache.clear();
    }
  } catch {
    // Cache cleanup must never block sign-out or local data cleanup.
  }
}