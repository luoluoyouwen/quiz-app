# Feedback And Reply Deletion

## Goal

Add safe deletion controls to the feedback system without turning administrator replies into a separate conversation model.

## Permission Model

- A user may delete only their own feedback while its status is `open` and it has no administrator reply.
- An administrator may delete any feedback record.
- An administrator may withdraw an existing reply without deleting the feedback. Withdrawal clears `admin_reply`, `replied_by`, and `replied_at`, then restores the feedback status to `open`.
- Replied and closed feedback cannot be deleted from the user interface.
- Every successful deletion or reply withdrawal writes an audit event. Audit details include identifiers and status metadata, not feedback or reply body text.

## API Design

### User Feedback

`DELETE /api/feedback?id=<feedback-id>` requires a valid user session. The server deletes only when `id`, `user_id`, `status = open`, and an empty `admin_reply` all match. A missing record returns `404`; a record that exists but is no longer deletable returns `409`.

Because this endpoint uses the service role to call PostgREST, ownership and status checks are enforced explicitly in the server query instead of relying on service-role RLS behavior.

### Administrator Feedback

`DELETE /api/admin/feedback?id=<feedback-id>&scope=feedback` deletes the complete feedback record after administrator verification.

`DELETE /api/admin/feedback?id=<feedback-id>&scope=reply` clears the reply fields and returns the updated feedback record. It returns `409` when the feedback has no reply to withdraw.

Both operations return `404` when the target does not exist and write distinct audit actions.

## Database Policy

Add `DELETE` to the authenticated grant for `feedback_items` and add an ownership policy for direct Data API defense:

```sql
CREATE POLICY "feedback_items_own_delete_open" ON feedback_items FOR DELETE
TO authenticated
USING (
  (select auth.uid()) = user_id
  AND status = 'open'
  AND NULLIF(BTRIM(COALESCE(admin_reply, '')), '') IS NULL
);
```

The administrator Pages Function continues to use the service role after verifying the caller against the server-owned profile role.

## User Interface

- The personal feedback list shows a compact delete icon only on deletable `open` items.
- The confirmation explains that deletion is permanent.
- After success, the item is removed from local state without reloading the modal.
- The administrator table keeps the reply action and adds a delete icon with a permanent-deletion confirmation.
- When the reply modal contains an existing reply, it exposes a danger-styled `撤回回复` action. After success, the modal closes and the list refreshes to `待回复`.
- Loading state is scoped to the item being deleted or the active reply modal so unrelated controls remain usable.

## Failure Handling

- `401`: ask the user to sign in again.
- `403`: administrator permission is required.
- `404`: show that the feedback no longer exists and refresh the list.
- `409`: show that the feedback state changed and refresh the list.
- Other failures preserve the visible record and show the API error message.

## Verification

- Unit-test client request helpers and deletion eligibility logic.
- Test user deletion ownership and state guards in the Pages Function.
- Test administrator feedback deletion and reply withdrawal, including audit calls.
- Run the complete Vitest suite and production build.
- Browser-test user and administrator controls in desktop/mobile and light/dark themes.
- Verify an open user feedback can be deleted, a replied item cannot be user-deleted, an administrator reply can be withdrawn, and an administrator can delete a feedback record.
