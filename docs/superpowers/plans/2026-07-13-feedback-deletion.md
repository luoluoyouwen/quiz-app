# Feedback Deletion Implementation Plan

**Goal:** Add controlled feedback deletion for users and administrators, plus administrator reply withdrawal, without weakening ownership checks or losing auditability.

**Architecture:** Keep the existing React message-center clients and Cloudflare Pages Functions. The UI only exposes valid actions, while each API independently reloads and validates the current database row before mutating it. All destructive actions use item-scoped loading, explicit confirmation, and metadata-only audit events.

**Tech Stack:** React 19, Ant Design 6, TypeScript, Vitest, Cloudflare Pages Functions, Supabase/PostgREST.

---

### Task 1: Define and test client behavior

**Files:**
- Modify: `src/lib/messageCenter.test.ts`
- Modify: `src/lib/messageCenter.ts`

1. Add a failing test proving users may delete only `open` feedback with no non-blank administrator reply.
2. Implement `canDeleteOwnFeedback` and API clients for user delete, administrator delete, and reply withdrawal.
3. Run the focused helper test and confirm it passes.

### Task 2: Implement and test server authorization

**Files:**
- Create: `functions/api/feedback.test.ts`
- Create: `functions/api/admin/feedback.test.ts`
- Modify: `functions/api/feedback.ts`
- Modify: `functions/api/admin/feedback.ts`

1. Add failing handler tests for ownership, state conflicts, administrator deletion, reply withdrawal, missing rows, and audit calls.
2. Implement `DELETE /api/feedback?id=<id>` with a fresh row read and `404`/`409` responses.
3. Implement `DELETE /api/admin/feedback?id=<id>&scope=feedback|reply` with administrator verification, row-state validation, and metadata-only audit records.
4. Run focused API tests and confirm they pass.

### Task 3: Add user and administrator controls

**Files:**
- Modify: `src/components/UserMessageActions.tsx`
- Modify: `src/components/MessageCenterAdmin.tsx`

1. Show a compact confirmed delete action only for eligible user-owned feedback.
2. Add administrator delete actions to the table.
3. Add a confirmed `撤回回复` action to the reply modal when a reply exists.
4. Keep loading scoped to the affected row/action and update local lists without blocking unrelated controls.

### Task 4: Update database policy and verify end to end

**Files:**
- Modify: `supabase/announcements-feedback.sql`

1. Grant authenticated delete access and add an ownership/status/reply-aware DELETE RLS policy.
2. Run the full test suite, lint, and production build.
3. Verify user and administrator flows in the in-app browser at desktop and mobile widths, including cancel paths and forbidden states.
