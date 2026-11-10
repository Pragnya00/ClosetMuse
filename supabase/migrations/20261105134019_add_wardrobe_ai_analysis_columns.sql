/*
# Add AI clothing analysis columns to wardrobe_items

## Overview
Adds storage for Gemini-generated clothing attributes and for the user's own
confirmed corrections. AI output and user-entered values are kept in separate
columns so a re-analysis never overwrites what the user confirmed.

## Modified Table: wardrobe_items
- `ai_attributes` (jsonb, nullable) - validated JSON returned by the AI analysis.
- `ai_status` (text, not null, default 'none') - one of none, analyzing, ready, failed.
- `ai_error` (text, nullable) - short user-facing message from the last failed analysis.
- `ai_image_hash` (text, nullable) - SHA-256 of the image bytes that were analysed, used to skip repeat calls for an unchanged photo.
- `ai_analyzed_at` (timestamptz, nullable) - when the last successful analysis finished.
- `user_attributes` (jsonb, nullable) - attributes the user edited or confirmed.
- `attributes_confirmed_at` (timestamptz, nullable) - when the user last confirmed the attributes.

## Security
- No new tables, so no new grants or policies are needed.
- Existing owner-only RLS policies on wardrobe_items already cover these columns.
- The analysis edge function reads and writes these columns through the calling user's own session, so RLS enforces ownership.

## Important Notes
1. All new columns are nullable or have a default, so existing rows are unaffected.
2. No existing columns are dropped, renamed, or retyped.
*/

ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS ai_attributes jsonb;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'none';
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS ai_error text;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS ai_image_hash text;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS user_attributes jsonb;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS attributes_confirmed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wardrobe_items_ai_status_check'
  ) THEN
    ALTER TABLE wardrobe_items
      ADD CONSTRAINT wardrobe_items_ai_status_check
      CHECK (ai_status IN ('none', 'analyzing', 'ready', 'failed'));
  END IF;
END $$;
