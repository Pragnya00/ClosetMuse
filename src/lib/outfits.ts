import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { WardrobeItem } from '@/types/wardrobe';
import type { OutfitSuggestion, SavedOutfit } from '@/types/outfit';

/** How many wardrobe items are sent to the AI at once (must match MAX_ITEMS in the Edge Function). */
export const MAX_ITEMS_FOR_AI = 10;
export const MIN_ITEMS_FOR_AI = 2;

// ── Edge Function ───────────────────────────────────────────────────────────

async function readFunctionError(
  error: unknown,
  fallback = 'Outfit suggestions failed. Please try again.',
): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: unknown };
      console.error('[Outfits] Edge Function HTTP error:', body);
      if (typeof body.error === 'string' && body.error) return body.error;
    } catch {
      console.error('[Outfits] Edge Function HTTP error (could not parse body):', error.message);
    }
    return fallback;
  }
  if (error instanceof FunctionsRelayError) {
    console.error('[Outfits] Edge Function relay error:', error.message);
    return 'The server function encountered a startup error. Please try again or check the Edge Function logs.';
  }
  if (error instanceof FunctionsFetchError) {
    console.error('[Outfits] Edge Function fetch error:', error.message);
    return 'Could not reach the server function. Check your connection and that the Edge Function is deployed.';
  }
  console.error('[Outfits] Unexpected error:', error);
  return fallback;
}

/** An item the Edge Function could not use, with a short reason. */
export interface SkippedItem {
  itemId: string;
  name: string;
  reason: string;
}

export interface SuggestionResult {
  outfits: OutfitSuggestion[];
  /** How many items were actually sent to the AI. */
  itemsUsed: number;
  /** Items left out (missing, oversized or unsupported photos). */
  skipped: SkippedItem[];
}

/**
 * Asks the `recommend-outfits` Edge Function for outfits. Only item ids are sent;
 * the function downloads the photos itself using the signed-in user's session.
 */
export async function recommendOutfits(items: WardrobeItem[], userRequest = ''): Promise<SuggestionResult> {
  const itemIds = items.slice(0, MAX_ITEMS_FOR_AI).map((i) => i.id); // items arrive newest first

  const { data, error } = await supabase.functions.invoke('recommend-outfits', {
    body: { itemIds, userRequest: userRequest.trim().slice(0, 500) },
  });
  if (error) throw new Error(await readFunctionError(error));

  const payload = data as { outfits?: unknown; itemsUsed?: unknown; skipped?: unknown } | null;
  const raw = payload?.outfits;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('The outfit service returned an unexpected result. Please try again.');
  }
  const outfits = raw.flatMap((o): OutfitSuggestion[] => {
    const r = o as Partial<OutfitSuggestion>;
    if (typeof r.name !== 'string' || !Array.isArray(r.itemIds)) return [];
    return [{
      name: r.name,
      explanation: typeof r.explanation === 'string' ? r.explanation : '',
      itemIds: r.itemIds.filter((id): id is string => typeof id === 'string'),
    }];
  });
  if (outfits.length === 0) {
    throw new Error('The outfit service returned an unexpected result. Please try again.');
  }

  const skipped = (Array.isArray(payload?.skipped) ? payload.skipped : []).flatMap((s): SkippedItem[] => {
    const r = s as Partial<SkippedItem>;
    return typeof r.name === 'string' && typeof r.reason === 'string'
      ? [{ itemId: String(r.itemId ?? ''), name: r.name, reason: r.reason }]
      : [];
  });
  const itemsUsed = typeof payload?.itemsUsed === 'number' ? payload.itemsUsed : itemIds.length - skipped.length;
  return { outfits, itemsUsed, skipped };
}

/** Sends a short audio file to the authenticated Gnani transcription Edge Function. */
export async function transcribeAudio(file: File): Promise<{ transcript: string; detectedLanguageCode?: string }> {
  const allowedExtensions = new Set(['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a']);
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!allowedExtensions.has(extension)) {
    throw new Error('Please choose a WAV, MP3, OGG, FLAC, AAC, or M4A audio file.');
  }
  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a non-empty audio file smaller than 5 MB. Keep the recording under 30 seconds.');
  }

  const form = new FormData();
  form.append('audio_file', file, file.name);
  const { data, error } = await supabase.functions.invoke('transcribe-audio', { body: form });
  if (error) throw new Error(await readFunctionError(error, 'Audio transcription failed. Please try again.'));

  const payload = data as { transcript?: unknown; detectedLanguageCode?: unknown } | null;
  if (typeof payload?.transcript !== 'string' || !payload.transcript.trim()) {
    throw new Error('No speech was detected. Please try a clearer recording.');
  }
  return {
    transcript: payload.transcript.trim(),
    detectedLanguageCode: typeof payload.detectedLanguageCode === 'string' ? payload.detectedLanguageCode : undefined,
  };
}

// ── Saved outfits (saved_outfits + saved_outfit_items) ──────────────────────

interface SavedOutfitRow {
  id: string;
  name: string;
  explanation: string | null;
  created_at: string;
  saved_outfit_items: { item_id: string; sort_order: number }[];
}

export async function fetchSavedOutfits(): Promise<SavedOutfit[]> {
  const { data, error } = await supabase
    .from('saved_outfits')
    .select('id, name, explanation, created_at, saved_outfit_items(item_id, sort_order)')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load saved outfits: ${error.message}`);
  }

  return (data as unknown as SavedOutfitRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    explanation: row.explanation,
    created_at: row.created_at,
    itemIds: [...row.saved_outfit_items].sort((a, b) => a.sort_order - b.sort_order).map((i) => i.item_id),
  }));
}

/** Two inserts (outfit, then its items). If the second fails, the outfit is removed again. */
export async function saveOutfit(suggestion: OutfitSuggestion): Promise<SavedOutfit> {
  const { data: outfit, error } = await supabase
    .from('saved_outfits')
    .insert({ name: suggestion.name.trim().slice(0, 100), explanation: suggestion.explanation.trim().slice(0, 1000) || null })
    .select('id, name, explanation, created_at')
    .single();

  if (error || !outfit) {
    throw new Error(`Failed to save outfit: ${error?.message ?? 'unknown error'}`);
  }

  const { error: itemsError } = await supabase.from('saved_outfit_items').insert(
    suggestion.itemIds.map((itemId, index) => ({ outfit_id: outfit.id, item_id: itemId, sort_order: index })),
  );

  if (itemsError) {
    await supabase.from('saved_outfits').delete().eq('id', outfit.id);
    throw new Error(`Failed to save outfit items: ${itemsError.message}`);
  }

  return { ...(outfit as Omit<SavedOutfit, 'itemIds'>), itemIds: suggestion.itemIds };
}

export async function deleteSavedOutfit(id: string): Promise<void> {
  const { error } = await supabase.from('saved_outfits').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete outfit: ${error.message}`);
  }
}
