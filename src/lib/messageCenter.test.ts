import { describe, expect, it } from 'vitest';
import { canDeleteOwnFeedback, getAnnouncementStatus, validateFeedbackDraft } from './messageCenter';

describe('messageCenter helpers', () => {
  it('classifies announcements by publish and expiry dates', () => {
    const now = new Date('2026-07-11T12:00:00.000Z');

    expect(getAnnouncementStatus({ is_published: false }, now)).toBe('draft');
    expect(getAnnouncementStatus({ is_published: true, published_at: '2026-07-12T00:00:00.000Z' }, now)).toBe('scheduled');
    expect(getAnnouncementStatus({ is_published: true, expires_at: '2026-07-10T23:59:59.000Z' }, now)).toBe('expired');
    expect(getAnnouncementStatus({ is_published: true, published_at: '2026-07-10T00:00:00.000Z', expires_at: '2026-07-12T00:00:00.000Z' }, now)).toBe('active');
  });

  it('validates feedback drafts before submission', () => {
    expect(validateFeedbackDraft({ category: '', title: '', content: '' })).toEqual({
      category: '请选择反馈类型',
      title: '请输入反馈标题',
      content: '请输入反馈内容',
    });

    expect(validateFeedbackDraft({ category: 'bug', title: '  页面按钮错位  ', content: '  移动端深色模式下不可读  ' })).toEqual({});
  });

  it('allows users to delete only open feedback without an admin reply', () => {
    expect(canDeleteOwnFeedback({ status: 'open', admin_reply: null })).toBe(true);
    expect(canDeleteOwnFeedback({ status: 'open', admin_reply: '   ' })).toBe(true);
    expect(canDeleteOwnFeedback({ status: 'open', admin_reply: '请更新后重试' })).toBe(false);
    expect(canDeleteOwnFeedback({ status: 'replied', admin_reply: null })).toBe(false);
    expect(canDeleteOwnFeedback({ status: 'closed', admin_reply: null })).toBe(false);
  });
});
