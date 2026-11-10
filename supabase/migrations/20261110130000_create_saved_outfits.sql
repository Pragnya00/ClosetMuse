/*
# Create saved_outfits and saved_outfit_items tables

## Overview
Lets a user save an outfit (a named set of their own wardrobe items) that was
recommended by the AI outfit feature. Purely additive: no existing table,
column, policy, function or bucket is modified.

## New Tables
- `saved_outfits`
  - `id` (uuid, primary key) — unique identifier for the saved outfit
  - `user_id` (uuid, not null, defaults to authenticated user) — owner, references auth.users
  - `name` (text, not null, 1–100 chars) — outfit title (initially the AI-suggested name)
  - `explanation` (text, nullable, max 1000 chars) — short AI explanation of why the outfit works
  - `created_at` (timestamptz, default now()) — when the outfit was saved
- `saved_outfit_items` (join table: which wardrobe items make up an outfit)
  - `outfit_id` (uuid, not null) — references saved_outfits(id), ON DELETE CASCADE
  - `item_id` (uuid, not null) — references wardrobe_items(id), ON DELETE CASCADE
  - `sort_order` (smallint, not null, default 0) — display order of the item within the outfit
  - Primary key (outfit_id, item_id): an item can appear only once per outfit

## Indexes
- `idx_saved_outfits_user_created` on (user_id, created_at DESC) — list a user's outfits newest first
- `idx_saved_outfit_items_item_id` on (item_id) — makes deleting a wardrobe item (cascade) fast

## Security (RLS)
- RLS is ENABLED on both tables.
- Default Supabase table privileges are revoked first, then only the needed grants are given
  to `authenticated`. `anon` gets nothing.
- saved_outfits: SELECT, INSERT, DELETE (own rows only). No UPDATE: outfits are immutable once saved.
- saved_outfit_items: SELECT, INSERT only. Rows are removed automatically by cascade when
  the outfit or the wardrobe item is deleted.
- Inserting an outfit item requires the outfit AND the wardrobe item to both belong to the caller.

## Important Notes
1. Deleting a wardrobe item removes it from any saved outfits (cascade). An outfit can end up
   with fewer items than when it was saved; the UI must handle that.
2. The 2–6 items-per-outfit limit is enforced by the application, not by the database.
3. No functions or triggers are created, so no EXECUTE grants need revoking.
*/

CREATE TABLE IF NOT EXISTS saved_outfits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  explanation text CHECK (explanation IS NULL OR char_length(explanation) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_outfit_items (
  outfit_id uuid NOT NULL REFERENCES saved_outfits(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  PRIMARY KEY (outfit_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_outfits_user_created ON saved_outfits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_outfit_items_item_id ON saved_outfit_items(item_id);

ALTER TABLE saved_outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_outfit_items ENABLE ROW LEVEL SECURITY;

-- Drop any default API-role privileges, then grant only what the app needs
REVOKE ALL ON saved_outfits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON saved_outfit_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON saved_outfits TO authenticated;
GRANT SELECT, INSERT ON saved_outfit_items TO authenticated;

-- saved_outfits: users can only see, create and delete their own outfits
DROP POLICY IF EXISTS "select_own_saved_outfits" ON saved_outfits;
CREATE POLICY "select_own_saved_outfits" ON saved_outfits
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_saved_outfits" ON saved_outfits;
CREATE POLICY "insert_own_saved_outfits" ON saved_outfits
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_saved_outfits" ON saved_outfits;
CREATE POLICY "delete_own_saved_outfits" ON saved_outfits
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- saved_outfit_items: access follows ownership of the parent outfit
DROP POLICY IF EXISTS "select_own_saved_outfit_items" ON saved_outfit_items;
CREATE POLICY "select_own_saved_outfit_items" ON saved_outfit_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM saved_outfits o
      WHERE o.id = saved_outfit_items.outfit_id AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_saved_outfit_items" ON saved_outfit_items;
CREATE POLICY "insert_own_saved_outfit_items" ON saved_outfit_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM saved_outfits o
      WHERE o.id = saved_outfit_items.outfit_id AND o.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM wardrobe_items w
      WHERE w.id = saved_outfit_items.item_id AND w.user_id = auth.uid()
    )
  );
