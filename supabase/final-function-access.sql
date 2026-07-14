-- Remove authenticated access from legacy SECURITY DEFINER RPCs that the app no longer calls.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.admin_add_audit_log(text, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_user(text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_bank(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_audit_logs(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_wrong_question_stats(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_upload() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_sessions(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_wrong_count(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

COMMIT;
