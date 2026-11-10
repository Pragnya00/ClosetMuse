import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, Bookmark, BookmarkCheck, Trash2, Shirt, Mic, Upload } from 'lucide-react';
import type { WardrobeItem } from '@/types/wardrobe';
import type { OutfitSuggestion, SavedOutfit } from '@/types/outfit';
import {
  MAX_ITEMS_FOR_AI,
  MIN_ITEMS_FOR_AI,
  deleteSavedOutfit,
  fetchSavedOutfits,
  recommendOutfits,
  transcribeAudio,
  saveOutfit,
  type SkippedItem,
} from '@/lib/outfits';
import OutfitCard from '@/components/OutfitCard';

interface Props {
  items: WardrobeItem[];
}

type SaveState = 'saving' | 'saved';

export default function OutfitsView({ items }: Props) {
  const [suggestions, setSuggestions] = useState<OutfitSuggestion[]>([]);
  const [itemsUsed, setItemsUsed] = useState(0);
  const [skippedItems, setSkippedItems] = useState<SkippedItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [saveErrors, setSaveErrors] = useState<Record<number, string>>({});

  const [saved, setSaved] = useState<SavedOutfit[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const existing = useCallback(
    (ids: string[]) => ids.flatMap((id) => (itemsById.has(id) ? [itemsById.get(id)!] : [])),
    [itemsById],
  );

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      setSaved(await fetchSavedOutfits());
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : 'Failed to load saved outfits.');
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const handleTranscribe = async () => {
    if (!audioFile) return;
    setTranscribing(true);
    setTranscriptionError(null);
    setTranscript('');
    try {
      const result = await transcribeAudio(audioFile);
      setTranscript(result.transcript);
    } catch (err) {
      setTranscriptionError(err instanceof Error ? err.message : 'Could not transcribe this recording.');
    } finally {
      setTranscribing(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setSkippedItems([]);
    try {
      const result = await recommendOutfits(items, transcript);
      setSuggestions(result.outfits);
      setItemsUsed(result.itemsUsed);
      setSkippedItems(result.skipped);
      setSaveStates({});
      setSaveErrors({});
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Outfit suggestions failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (index: number) => {
    setSaveStates((s) => ({ ...s, [index]: 'saving' }));
    setSaveErrors((e) => {
      const next = { ...e };
      delete next[index];
      return next;
    });
    try {
      const outfit = await saveOutfit(suggestions[index]);
      setSaved((prev) => [outfit, ...prev]);
      setSaveStates((s) => ({ ...s, [index]: 'saved' }));
    } catch (err) {
      setSaveStates((s) => {
        const next = { ...s };
        delete next[index];
        return next;
      });
      setSaveErrors((e) => ({ ...e, [index]: err instanceof Error ? err.message : 'Could not save this outfit.' }));
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteSavedOutfit(id);
      setSaved((prev) => prev.filter((o) => o.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : 'Could not delete this outfit.');
    } finally {
      setDeletingId(null);
    }
  };

  const enoughItems = items.length >= MIN_ITEMS_FOR_AI;

  return (
    <div className="space-y-12">
      {/* ── Suggestions ─────────────────────────────────────────────── */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-stone-900">Outfit ideas</h2>
            <p className="text-sm text-stone-500 mt-1 max-w-xl">
              The AI looks at the photos of your own clothes and puts together outfits from them.
              {items.length > MAX_ITEMS_FOR_AI && ` It uses your ${MAX_ITEMS_FOR_AI} most recently added items.`}
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!enoughItems || generating}
            className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Styling…' : suggestions.length > 0 ? 'Suggest again' : 'Suggest outfits'}
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-stone-800"><Mic className="h-4 w-4" /> Ask by voice (optional)</p>
              <p className="mt-1 text-xs text-stone-500">Upload a recording up to 30 seconds (5 MB max). WAV, MP3, M4A, OGG, FLAC or AAC.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">
                <Upload className="h-4 w-4" />
                Choose audio
                <input
                  type="file"
                  accept=".wav,.mp3,.m4a,.ogg,.flac,.aac,audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/flac,audio/aac"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setAudioFile(file);
                    setTranscript('');
                    setTranscriptionError(null);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleTranscribe}
                disabled={!audioFile || transcribing}
                className="btn-secondary flex items-center gap-2 !px-3 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                {transcribing ? 'Transcribing…' : 'Convert to text'}
              </button>
            </div>
          </div>
          {audioFile && <p className="mt-2 text-xs text-stone-500">Selected: {audioFile.name}</p>}
          {transcriptionError && <p className="mt-2 text-xs text-red-600">{transcriptionError}</p>}
          {transcript && (
            <div className="mt-3 rounded-lg bg-stone-50 p-3">
              <p className="text-xs font-medium text-stone-500">Recognized request</p>
              <p className="mt-1 text-sm text-stone-800">{transcript}</p>
              <button type="button" onClick={() => { setTranscript(''); setAudioFile(null); }} className="mt-2 text-xs text-stone-500 underline">Clear voice request</button>
            </div>
          )}
        </div>

        {generateError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
            {generateError}
          </div>
        )}

        {!enoughItems ? (
          <div className="card flex flex-col items-center text-center py-14 px-6">
            <div className="flex items-center justify-center w-16 h-16 bg-stone-100 rounded-2xl mb-4">
              <Shirt className="w-8 h-8 text-stone-300" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-semibold text-stone-800 mb-1">Add a few more clothes first</h3>
            <p className="text-sm text-stone-400 max-w-sm">
              You need at least {MIN_ITEMS_FOR_AI} items with photos in your wardrobe before the AI can suggest outfits.
            </p>
          </div>
        ) : generating ? (
          <div className="card flex flex-col items-center text-center py-14 px-6">
            <Loader2 className="w-8 h-8 text-stone-300 animate-spin mb-4" />
            <p className="text-sm text-stone-500">Looking through your wardrobe photos… this can take up to a minute.</p>
          </div>
        ) : suggestions.length === 0 ? (
          !generateError && (
            <div className="card flex flex-col items-center text-center py-14 px-6">
              <div className="flex items-center justify-center w-16 h-16 bg-amber-50 rounded-2xl mb-4">
                <Sparkles className="w-8 h-8 text-amber-400" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-stone-800 mb-1">Ready when you are</h3>
              <p className="text-sm text-stone-400 max-w-sm">
                Tap “Suggest outfits” to see combinations made from your own clothes.
              </p>
            </div>
          )
        ) : (
          <>
            <p className="text-xs text-stone-400 mb-4">Based on {itemsUsed} items from your wardrobe.</p>
            {skippedItems.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800">
                Left out: {skippedItems.map((s) => `${s.name} (${s.reason})`).join(', ')}.
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {suggestions.map((s, index) => {
                const state = saveStates[index];
                return (
                  <div key={`${index}-${s.name}`}>
                    <OutfitCard
                      name={s.name}
                      explanation={s.explanation}
                      items={existing(s.itemIds)}
                      actions={
                        <button
                          onClick={() => handleSave(index)}
                          disabled={state === 'saving' || state === 'saved'}
                          className="btn-secondary !px-4 !py-2 text-sm flex items-center gap-2"
                        >
                          {state === 'saving' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : state === 'saved' ? (
                            <BookmarkCheck className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Bookmark className="w-4 h-4" />
                          )}
                          {state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : 'Save outfit'}
                        </button>
                      }
                    />
                    {saveErrors[index] && <p className="mt-2 text-xs text-red-600">{saveErrors[index]}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── Saved outfits ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-2xl font-semibold text-stone-900 mb-6">Saved outfits</h2>

        {savedError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">{savedError}</div>
        )}

        {savedLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
          </div>
        ) : saved.length === 0 ? (
          !savedError && (
            <p className="text-sm text-stone-400">
              Nothing saved yet. Save an outfit you like and it will show up here.
            </p>
          )
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {saved.map((outfit) => {
              const pieces = existing(outfit.itemIds);
              const removed = outfit.itemIds.length - pieces.length;
              const incomplete = pieces.length < MIN_ITEMS_FOR_AI;
              const note = incomplete
                ? 'This outfit is incomplete: most of its pieces were removed from your wardrobe.'
                : removed > 0
                  ? `${removed} piece${removed > 1 ? 's were' : ' was'} removed from your wardrobe since you saved this.`
                  : null;
              const confirming = confirmDeleteId === outfit.id;
              return (
                <OutfitCard
                  key={outfit.id}
                  name={outfit.name}
                  explanation={outfit.explanation}
                  items={pieces}
                  incompleteNote={note}
                  actions={
                    confirming ? (
                      <>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(outfit.id)}
                          disabled={deletingId === outfit.id}
                          className="btn-danger flex items-center gap-1.5"
                        >
                          {deletingId === outfit.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Delete outfit
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(outfit.id)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-stone-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
