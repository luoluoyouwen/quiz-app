export type AnnouncementLevel = 'info' | 'success' | 'warning' | 'critical';
export type AnnouncementStatus = 'draft' | 'scheduled' | 'active' | 'expired';
export type FeedbackStatus = 'open' | 'replied' | 'closed';

export interface AnnouncementLike {
  is_published?: boolean | null;
  published_at?: string | null;
  expires_at?: string | null;
}

export interface Announcement extends AnnouncementLike {
  id: string;
  title: string;
  content: string;
  level: AnnouncementLevel;
  is_pinned: boolean;
  created_at: string;
  updated_at?: string | null;
  read_at?: string | null;
}

export interface AnnouncementDraft {
  id?: string;
  title: string;
  content: string;
  level: AnnouncementLevel;
  is_pinned: boolean;
  is_published: boolean;
  published_at?: string | null;
  expires_at?: string | null;
}

export interface FeedbackDraft {
  category: string;
  title: string;
  content: string;
}

export interface FeedbackTicket extends FeedbackDraft {
  id: string;
  user_id: string;
  user_email?: string;
  status: FeedbackStatus;
  admin_reply?: string | null;
  replied_by?: string | null;
  replied_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export function getAnnouncementStatus(item: AnnouncementLike, now = new Date()): AnnouncementStatus {
  if (!item.is_published) return 'draft';
  const nowTime = now.getTime();
  if (item.published_at && new Date(item.published_at).getTime() > nowTime) return 'scheduled';
  if (item.expires_at && new Date(item.expires_at).getTime() < nowTime) return 'expired';
  return 'active';
}

export function validateFeedbackDraft(draft: FeedbackDraft): Partial<Record<keyof FeedbackDraft, string>> {
  const errors: Partial<Record<keyof FeedbackDraft, string>> = {};
  if (!draft.category.trim()) errors.category = '请选择反馈类型';
  if (!draft.title.trim()) errors.title = '请输入反馈标题';
  if (!draft.content.trim()) errors.content = '请输入反馈内容';
  return errors;
}

export function canDeleteOwnFeedback(item: Pick<FeedbackTicket, 'status' | 'admin_reply'>): boolean {
  return item.status === 'open' && !item.admin_reply?.trim();
}

async function getAccessToken(): Promise<string> {
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('请先登录');
  return token;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => null) as { error?: string; detail?: string } | T | null;
  if (!response.ok) {
    const errorPayload = payload as { error?: string; detail?: string } | null;
    throw new Error(errorPayload?.error || errorPayload?.detail || `Request failed: ${response.status}`);
  }
  return payload as T;
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const payload = await requestJson<{ announcements: Announcement[] }>('/api/announcements');
  return payload?.announcements || [];
}

export async function markAnnouncementRead(announcementId: string): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ announcement_id: announcementId }),
  });
}

export async function fetchMyFeedback(): Promise<FeedbackTicket[]> {
  const payload = await requestJson<{ feedback: FeedbackTicket[] }>('/api/feedback');
  return payload?.feedback || [];
}

export async function createFeedback(draft: FeedbackDraft): Promise<FeedbackTicket> {
  const errors = validateFeedbackDraft(draft);
  if (Object.keys(errors).length > 0) throw new Error(Object.values(errors)[0]);
  const payload = await requestJson<{ feedback: FeedbackTicket }>('/api/feedback', {
    method: 'POST',
    body: JSON.stringify({
      category: draft.category.trim(),
      title: draft.title.trim(),
      content: draft.content.trim(),
    }),
  });
  if (!payload?.feedback) throw new Error('提交反馈失败，请稍后重试');
  return payload.feedback;
}

export async function deleteOwnFeedback(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/feedback?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchAdminAnnouncements(): Promise<Announcement[]> {
  const payload = await requestJson<{ announcements: Announcement[] }>('/api/admin/announcements');
  return payload?.announcements || [];
}

export async function saveAdminAnnouncement(draft: AnnouncementDraft): Promise<Announcement> {
  const method = draft.id ? 'PATCH' : 'POST';
  const payload = await requestJson<{ announcement: Announcement }>('/api/admin/announcements', {
    method,
    body: JSON.stringify(draft),
  });
  if (!payload?.announcement) throw new Error('保存公告失败，请稍后重试');
  return payload.announcement;
}

export async function deleteAdminAnnouncement(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/admin/announcements?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchAdminFeedback(): Promise<FeedbackTicket[]> {
  const payload = await requestJson<{ feedback: FeedbackTicket[] }>('/api/admin/feedback');
  return payload?.feedback || [];
}

export async function replyAdminFeedback(id: string, reply: string, status: FeedbackStatus = 'replied'): Promise<FeedbackTicket> {
  const payload = await requestJson<{ feedback: FeedbackTicket }>('/api/admin/feedback', {
    method: 'PATCH',
    body: JSON.stringify({ id, admin_reply: reply.trim(), status }),
  });
  if (!payload?.feedback) throw new Error('保存回复失败，请稍后重试');
  return payload.feedback;
}

export async function deleteAdminFeedback(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/admin/feedback?id=${encodeURIComponent(id)}&scope=feedback`, { method: 'DELETE' });
}

export async function withdrawAdminFeedbackReply(id: string): Promise<FeedbackTicket> {
  const payload = await requestJson<{ feedback: FeedbackTicket }>(`/api/admin/feedback?id=${encodeURIComponent(id)}&scope=reply`, { method: 'DELETE' });
  if (!payload?.feedback) throw new Error('撤回回复失败，请稍后重试');
  return payload.feedback;
}
