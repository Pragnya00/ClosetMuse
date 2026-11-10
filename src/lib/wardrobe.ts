import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { AiAnalysis, ClothingAttributes, WardrobeItem, WardrobeItemInput } from '@/types/wardrobe';

const BUCKET = 'wardrobe-images';

export async function uploadItemImage(file: File, userId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  return fileName;
}

export async function deleteItemImage(imagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([imagePath]);
  if (error) {
    console.error('Failed to delete image:', error.message);
  }
}

export async function getItemImageUrl(imagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(imagePath, 3600);

  if (error) {
    console.error('Failed to get image URL:', error.message);
    return null;
  }

  return data.signedUrl;
}

export async function fetchWardrobeItems(): Promise<WardrobeItem[]> {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch wardrobe items: ${error.message}`);
  }

  return data as WardrobeItem[];
}

export async function createWardrobeItem(item: WardrobeItemInput): Promise<WardrobeItem> {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .insert(item)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create wardrobe item: ${error.message}`);
  }

  return data as WardrobeItem;
}

export async function updateWardrobeItem(
  id: string,
  updates: Partial<WardrobeItemInput>
): Promise<WardrobeItem> {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update wardrobe item: ${error.message}`);
  }

  return data as WardrobeItem;
}

export async function deleteWardrobeItem(id: string, imagePath: string): Promise<void> {
  await deleteItemImage(imagePath);

  const { error } = await supabase.from('wardrobe_items').delete().eq('id', id);

  if (error) {
    throw new Error(`Failed to delete wardrobe item: ${error.message}`);
  }
}

async function readFunctionError(error: unknown): Promise<string> {
  const fallback = 'The analysis failed. Please try again.';
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: unknown };
      console.error('[AI Analysis] Edge Function HTTP error:', body);
      if (typeof body.error === 'string' && body.error) return body.error;
    } catch {
      console.error('[AI Analysis] Edge Function HTTP error (could not parse body):', error.message);
      return fallback;
    }
  }
  if (error instanceof FunctionsRelayError) {
    console.error('[AI Analysis] Edge Function relay error:', error.message);
    return 'The analysis service encountered a startup error. Please try again or check the Edge Function logs.';
  }
  if (error instanceof FunctionsFetchError) {
    console.error('[AI Analysis] Edge Function fetch error:', error.message);
    return 'Could not reach the analysis service. Please check your connection and that the Edge Function is deployed.';
  }
  if (error instanceof Error) {
    console.error('[AI Analysis] Unexpected error:', error.message);
  } else {
    console.error('[AI Analysis] Unexpected error:', error);
  }
  return fallback;
}

export async function analyzeWardrobeItem(
  itemId: string,
  force = false
): Promise<AiAnalysis> {
  const { data, error } = await supabase.functions.invoke('analyze-clothing', {
    body: { itemId, force },
  });

  if (error) {
    throw new Error(await readFunctionError(error));
  }

  const attributes = (data as { attributes?: unknown } | null)?.attributes;
  if (!attributes || typeof attributes !== 'object' || typeof (attributes as AiAnalysis).confidence !== 'number') {
    throw new Error('The analysis returned an unexpected result. Please try again.');
  }

  return attributes as AiAnalysis;
}

export async function confirmItemAttributes(
  id: string,
  attributes: ClothingAttributes
): Promise<WardrobeItem> {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .update({ user_attributes: attributes, attributes_confirmed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save attributes: ${error.message}`);
  }

  return data as WardrobeItem;
}
