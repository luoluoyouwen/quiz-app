import { describe, expect, it } from 'vitest';
import { getBackTarget, getPageTitle, getPrimaryTabKey } from './navigation';

describe('navigation helpers', () => {
  it('keeps bank detail and practice inside the bank tab', () => {
    expect(getPrimaryTabKey('/')).toBe('/');
    expect(getPrimaryTabKey('/bank/f7ed28e0-0600-4d70-8277-0558470913fb')).toBe('/');
    expect(getPrimaryTabKey('/practice/f7ed28e0-0600-4d70-8277-0558470913fb')).toBe('/');
  });

  it('maps root tab pages to their tab keys', () => {
    expect(getPrimaryTabKey('/stats')).toBe('/stats');
    expect(getPrimaryTabKey('/profile')).toBe('/profile');
    expect(getPrimaryTabKey('/admin')).toBe('/admin');
  });

  it('uses local back targets inside each main flow', () => {
    expect(getBackTarget('/practice/f7ed28e0-0600-4d70-8277-0558470913fb')).toBe('/bank/f7ed28e0-0600-4d70-8277-0558470913fb');
    expect(getBackTarget('/bank/f7ed28e0-0600-4d70-8277-0558470913fb')).toBe('/');
    expect(getBackTarget('/stats')).toBe('/');
    expect(getBackTarget('/profile')).toBe('/');
    expect(getBackTarget('/admin')).toBe('/');
    expect(getBackTarget('/')).toBeNull();
  });

  it('names the main app sections consistently', () => {
    expect(getPageTitle('/')).toBe('题库');
    expect(getPageTitle('/bank/abc')).toBe('题库详情');
    expect(getPageTitle('/practice/abc')).toBe('刷题练习');
    expect(getPageTitle('/stats')).toBe('统计');
    expect(getPageTitle('/profile')).toBe('我的');
    expect(getPageTitle('/admin')).toBe('后台管理');
  });
});
