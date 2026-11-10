/*
# Revoke execute on trigger function

## Overview
The `update_wardrobe_items_updated_at()` trigger function was created as SECURITY DEFINER,
which means it runs with the table owner's privileges. By default, Postgres grants EXECUTE
to PUBLIC on new functions, making it callable by anon and authenticated users via the REST API.
This function is only meant to be called by the database trigger, not by API clients.

## Security Changes
- REVOKE EXECUTE on `update_wardrobe_items_updated_at()` from PUBLIC, anon, and authenticated.
- This prevents anyone from calling the function via `/rest/v1/rpc/update_wardrobe_items_updated_at`.
*/

REVOKE EXECUTE ON FUNCTION update_wardrobe_items_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_wardrobe_items_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION update_wardrobe_items_updated_at() FROM authenticated;