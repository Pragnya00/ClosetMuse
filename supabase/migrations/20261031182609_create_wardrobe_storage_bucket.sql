/*
# Create storage bucket and policies for wardrobe images

## Overview
This migration sets up a private storage bucket called `wardrobe-images` for storing
clothing item photos. Each authenticated user can only upload, read, and delete their
own images. Images are organized in a per-user folder structure: `user_id/filename`.

## Storage Bucket
- `wardrobe-images` — private bucket for wardrobe item photos

## Storage Policies (RLS on storage.objects)
- SELECT: users can only read objects in their own user_id folder
- INSERT: users can only upload objects to their own user_id folder
- UPDATE: users can only update objects in their own user_id folder
- DELETE: users can only delete objects in their own user_id folder

## Important Notes
1. The bucket is private (not public) — image access requires authentication.
2. Objects are stored under the path `{user_id}/{filename}` so RLS policies can enforce ownership.
3. The frontend uploads to this path pattern and uses signed URLs or authenticated reads to display images.
*/

-- Create the storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('wardrobe-images', 'wardrobe-images', false)
ON CONFLICT (id) DO NOTHING;

-- SELECT policy: users can read their own images
DROP POLICY IF EXISTS "read_own_wardrobe_images" ON storage.objects;
CREATE POLICY "read_own_wardrobe_images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'wardrobe-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- INSERT policy: users can upload to their own folder
DROP POLICY IF EXISTS "insert_own_wardrobe_images" ON storage.objects;
CREATE POLICY "insert_own_wardrobe_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wardrobe-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- UPDATE policy: users can update their own images
DROP POLICY IF EXISTS "update_own_wardrobe_images" ON storage.objects;
CREATE POLICY "update_own_wardrobe_images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'wardrobe-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'wardrobe-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- DELETE policy: users can delete their own images
DROP POLICY IF EXISTS "delete_own_wardrobe_images" ON storage.objects;
CREATE POLICY "delete_own_wardrobe_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'wardrobe-images' AND (storage.foldername(name))[1] = auth.uid()::text);