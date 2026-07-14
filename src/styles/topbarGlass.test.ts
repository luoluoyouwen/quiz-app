import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const marker = '/* Unified topbar glass capsule */';

describe('topbar glass material', () => {
  it('uses the bottom navigation glass recipe without a gradient veil', () => {
    const markerIndex = css.indexOf(marker);

    expect(markerIndex).toBeGreaterThanOrEqual(0);

    const finalBlock = css.slice(markerIndex);

    expect(finalBlock).toContain('background: var(--app-bottom-tab-bg');
    expect(finalBlock).toContain('backdrop-filter: saturate(150%) blur(18px)');
    expect(finalBlock).toContain('border-radius: 999px');
    expect(finalBlock).toContain('content: none');
    expect(finalBlock).toContain('.quiz-desktop-nav-pill:not(.is-active)');
    expect(finalBlock).toContain('color: var(--app-text');
    expect(finalBlock).toContain('html.dark .quiz-desktop-topbar .quiz-user-pill');
    expect(finalBlock).not.toContain('mask-image');
    expect(finalBlock).not.toContain('linear-gradient');
  });
});
