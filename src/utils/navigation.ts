export function getPrimaryTabKey(pathname: string): string {
  if (pathname.startsWith('/bank/') || pathname.startsWith('/practice/')) return '/';
  const section = pathname.split('/')[1] || '';
  return `/${section}`;
}

export function getBackTarget(pathname: string): string | null {
  const practiceMatch = pathname.match(/^\/practice\/([^/?#]+)/);
  if (practiceMatch) return `/bank/${practiceMatch[1]}`;
  if (pathname.startsWith('/bank/')) return '/';
  if (pathname.startsWith('/stats') || pathname.startsWith('/profile') || pathname.startsWith('/admin')) return '/';
  return null;
}

export function getPageTitle(pathname: string): string {
  if (pathname === '/') return '题库';
  if (pathname.startsWith('/stats')) return '统计';
  if (pathname.startsWith('/profile')) return '我的';
  if (pathname.startsWith('/bank/')) return '题库详情';
  if (pathname.startsWith('/practice/')) return '刷题练习';
  if (pathname.startsWith('/admin')) return '后台管理';
  return '刷题 App';
}

export function getBankDetailPath(pathname: string): string | null {
  const bankMatch = pathname.match(/^\/bank\/([^/?#]+)/);
  const practiceMatch = pathname.match(/^\/practice\/([^/?#]+)/);
  const bankId = bankMatch?.[1] || practiceMatch?.[1];
  return bankId ? `/bank/${bankId}` : null;
}
