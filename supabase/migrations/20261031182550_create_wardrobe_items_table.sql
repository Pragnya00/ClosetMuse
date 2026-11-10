/*
# Create wardrobe_items table for digital wardrobe

## Overview
This migration creates the core `wardrobe_items` table that stores each user's clothing items
for the digital wardrobe app. Each user can only see and manage their own items.

## New Tables
- `wardrobe_items`
  - `id` (uuid, primary key) — unique identifier for each item
  - `user_id` (uuid, not null, defaults to authenticated user) — owner of the item, references auth.users
  - `name` (text, not null) — name/label for the clothing item (e.g. "Blue Denim Jacket")
  - `category` (text, not null) — category of clothing (e.g. tops, bottoms, outerwear, shoes, accessories)
  - `color` (text) — primary color of the item
  - `season` (text) — which season(s) the item is suited for (spring, summer, fall, winter, all)
  - `brand` (text) — brand/manufacturer of the item
  - `notes` (text) — any additional notes about the item
  - `image_path` (text, not null) — storage path to the item's image in the wardrobe-images bucket
  - `created_at` (timestamptz, default now()) — when the item was added
  - `updated_at` (timestamptz, default now()) — when the item was last modified

## Indexes
- `idx_wardrobe_items_user_id` on `user_id` — speeds up per-user queries
- `idx_wardrobe_items_category` on `category` — speeds up category filtering

## Security (RLS)
- Row Level Security is ENABLED on `wardrobe_items`.
- Grants: SELECT, INSERT, UPDATE, DELETE to `authenticated` only (app requires sign-in).
- Four separate policies (one per CRUD verb), all scoped to the owning user via `auth.uid() = user_id`.
- The `user_id` column defaults to `auth.uid()` so inserts that omit `user_id` from the client succeed.

## Important Notes
1. This app requires sign-in (email/password via Supabase Auth). The anon role has no access.
2. The `user_id` column uses `DEFAULT auth.uid()` so client-side inserts work without explicitly passing user_id.
3. `updated_at` is automatically maintained via a trigger.
*/

-- Create the wardrobe_items table
CREATE TABLE IF NOT EXISTS wardrobe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('tops', 'bottoms', 'outerwear', 'dresses', 'shoes', 'accessories', 'other')),
  color text,
  season text CHECK (season IN ('spring', 'summer', 'fall', 'winter', 'all')),
  brand text,
  notes text,
  image_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_user_id ON wardrobe_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_category ON wardrobe_items(category);

-- Enable Row Level Security
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;

-- Grant access only to authenticated users (this app requires sign-in)
GRANT SELECT, INSERT, UPDATE, DELETE ON wardrobe_items TO authenticated;

-- SELECT policy: users can only read their own items
DROP POLICY IF EXISTS "select_own_wardrobe_items" ON wardrobe_items;
CREATE POLICY "select_own_wardrobe_items" ON wardrobe_items
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- INSERT policy: users can only insert items they own
DROP POLICY IF EXISTS "insert_own_wardrobe_items" ON wardrobe_items;
CREATE POLICY "insert_own_wardrobe_items" ON wardrobe_items
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE policy: users can only update their own items
DROP POLICY IF EXISTS "update_own_wardrobe_items" ON wardrobe_items;
CREATE POLICY "update_own_wardrobe_items" ON wardrobe_items
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE policy: users can only delete their own items
DROP POLICY IF EXISTS "delete_own_wardrobe_items" ON wardrobe_items;
CREATE POLICY "delete_own_wardrobe_items" ON wardrobe_items
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_wardrobe_items_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_wardrobe_items_updated_at ON wardrobe_items;
CREATE TRIGGER trigger_wardrobe_items_updated_at
  BEFORE UPDATE ON wardrobe_items
  FOR EACH ROW
  EXECUTE FUNCTION update_wardrobe_items_updated_at();