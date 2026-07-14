# Unified Topbar Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the topbar gradient veil with one bottom-tab-style glass capsule across home and secondary pages.

**Architecture:** Keep the existing React markup and route chrome dimensions. Add a CSS contract test, then replace only the final topbar override block in `src/index.css` so the bar owns the glass surface and nested controls remain visually quiet.

**Tech Stack:** React 19, Vite 8, Vitest 4, CSS custom properties, Cloudflare Pages.

## Global Constraints

- Reuse `saturate(150%) blur(18px)`, the existing theme surface variables, a one-pixel low-contrast border, and the existing soft shadow.
- Do not change React structure, navigation behavior, bottom navigation styles, or topbar sizing variables.
- Keep focus-visible behavior and light/dark readability intact.

---

### Task 1: Unify The Topbar Glass Material

**Files:**
- Create: `src/styles/topbarGlass.test.ts`
- Modify: `src/index.css:8818`

**Interfaces:**
- Consumes: `.nk-navbar`, `.quiz-desktop-topbar`, `--app-bottom-tab-bg`, `--app-border`, `--app-shadow-soft`, and the existing topbar size variables.
- Produces: one `.nk-navbar, .quiz-desktop-topbar` glass surface with no gradient-mask pseudo-element.

- [ ] **Step 1: Write the failing CSS contract test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const marker = '/* Unified topbar glass capsule */';

describe('topbar glass material', () => {
  it('uses the bottom navigation glass recipe without a gradient veil', () => {
    const finalBlock = css.slice(css.indexOf(marker));

    expect(finalBlock).toContain('background: var(--app-bottom-tab-bg');
    expect(finalBlock).toContain('backdrop-filter: saturate(150%) blur(18px)');
    expect(finalBlock).toContain('border-radius: 999px');
    expect(finalBlock).toContain('content: none');
    expect(finalBlock).not.toContain('mask-image');
    expect(finalBlock).not.toContain('linear-gradient');
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm test -- src/styles/topbarGlass.test.ts`

Expected: FAIL because the unified marker and bottom-tab background are absent from the current final override.

- [ ] **Step 3: Replace the final topbar override**

```css
/* Unified topbar glass capsule */
.nk-navbar,
.quiz-desktop-topbar {
  isolation: isolate !important;
  overflow: visible !important;
  padding: calc((var(--quiz-topbar-h) - var(--quiz-topbar-control-h) - 2px) / 2) 6px !important;
  border: 1px solid var(--app-border, rgba(15, 23, 42, 0.08)) !important;
  border-radius: 999px !important;
  background: var(--app-bottom-tab-bg, rgba(255, 255, 255, 0.86)) !important;
  -webkit-backdrop-filter: saturate(150%) blur(18px) !important;
  backdrop-filter: saturate(150%) blur(18px) !important;
  box-shadow: var(--app-shadow-soft) !important;
  background-clip: padding-box !important;
  z-index: 940 !important;
}

.nk-navbar::before,
.quiz-desktop-topbar::before {
  content: none !important;
  display: none !important;
}

.nk-navbar .nk-user-pill,
.nk-navbar .nk-theme-btn,
.nk-navbar .nk-tags-pill,
.nk-navbar .nk-tag-pill,
.quiz-desktop-topbar .quiz-desktop-brand,
.quiz-desktop-topbar .quiz-desktop-nav-pills,
.quiz-desktop-topbar .quiz-desktop-page-title,
.quiz-desktop-topbar .quiz-user-pill,
.quiz-desktop-topbar .quiz-topbar-pill,
.quiz-desktop-topbar .quiz-topbar-icon {
  background: transparent !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
```

- [ ] **Step 4: Run automated verification**

Run: `npm test -- src/styles/topbarGlass.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript and Vite production build exit successfully.

- [ ] **Step 5: Run rendered QA**

Open the home route and one secondary route at desktop and mobile widths. Toggle light and dark themes and confirm stable topbar height, readable controls, no nested opaque capsules, no clipping, no content overlap, and unchanged bottom navigation.

- [ ] **Step 6: Deploy and verify preview**

Run: `npx wrangler --version`

Expected: Wrangler v4 or newer.

Run: `npx wrangler pages deploy dist --project-name $env:CLOUDFLARE_PAGES_PROJECT --branch preview`

Expected: Cloudflare Pages returns a unique deployment URL and the preview alias serves the new hashed CSS asset.
