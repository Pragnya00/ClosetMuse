import { useState, useEffect, useCallback } from 'react';
import {
  X,
  RefreshCw,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Sparkles,
  Tag,
  Plus,
} from 'lucide-react';
import type { WardrobeItem, ClothingAttributes, AiAnalysis } from '@/types/wardrobe';
import { analyzeWardrobeItem, confirmItemAttributes, getItemImageUrl } from '@/lib/wardrobe';
import { CATEGORIES } from '@/types/wardrobe';

interface Props {
  item: WardrobeItem;
  onClose: () => void;
  onUpdated: (updated: WardrobeItem) => void;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const colour =
    pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-stone-500">
        <span>AI Confidence</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TagList({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput('');
  };

  const remove = (t: string) => onChange(tags.filter((x) => x !== t));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-100 text-stone-700 rounded-lg text-xs"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="text-stone-400 hover:text-stone-700 leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
          }}
          placeholder="Add value…"
          className="input-field py-1.5 text-sm flex-1"
        />
        <button
          type="button"
          onClick={add}
          className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4 text-stone-600" />
        </button>
      </div>
    </div>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? 'Not detected'}
      className="input-field py-2 text-sm"
    />
  );
}

// ─── Attribute form ───────────────────────────────────────────────────────────

function attrToForm(attr: AiAnalysis | ClothingAttributes): FormState {
  return {
    category: attr.category ?? '',
    subcategory: attr.subcategory ?? '',
    primary_colour: attr.primary_colour ?? '',
    secondary_colours: attr.secondary_colours ?? [],
    colour_details: attr.colour_details ?? '',
    pattern: attr.pattern ?? '',
    visible_fabric_characteristics: attr.visible_fabric_characteristics ?? [],
    texture: attr.texture ?? '',
    style: attr.style ?? '',
    visible_attributes: attr.visible_attributes ?? [],
  };
}

interface FormState {
  category: string;
  subcategory: string;
  primary_colour: string;
  secondary_colours: string[];
  colour_details: string;
  pattern: string;
  visible_fabric_characteristics: string[];
  texture: string;
  style: string;
  visible_attributes: string[];
}

function formToAttributes(f: FormState): ClothingAttributes {
  return {
    category: f.category || null,
    subcategory: f.subcategory || null,
    primary_colour: f.primary_colour || null,
    secondary_colours: f.secondary_colours,
    colour_details: f.colour_details || null,
    pattern: f.pattern || null,
    visible_fabric_characteristics: f.visible_fabric_characteristics,
    texture: f.texture || null,
    style: f.style || null,
    visible_attributes: f.visible_attributes,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AiAnalysisPanel({ item, onClose, onUpdated }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The source of truth for the editable form
  const getInitialForm = useCallback((): FormState => {
    if (item.user_attributes) return attrToForm(item.user_attributes);
    if (item.ai_attributes) return attrToForm(item.ai_attributes);
    return attrToForm({
      category: null,
      subcategory: null,
      primary_colour: null,
      secondary_colours: [],
      colour_details: null,
      pattern: null,
      visible_fabric_characteristics: [],
      texture: null,
      style: null,
      visible_attributes: [],
    });
  }, [item]);

  const [form, setForm] = useState<FormState>(getInitialForm);
  const confidence = item.ai_attributes?.confidence ?? null;

  // Load signed image URL
  useEffect(() => {
    getItemImageUrl(item.image_path).then(setImageUrl);
  }, [item.image_path]);

  // Reset form if item changes (e.g. after re-analyse)
  useEffect(() => {
    setForm(getInitialForm());
    setSaved(false);
    setError(null);
  }, [item.id, item.ai_attributes, item.user_attributes, getInitialForm]);

  const field = <K extends keyof FormState>(key: K) => ({
    value: form[key] as string,
    onChange: (v: string) => setForm((f) => ({ ...f, [key]: v })),
  });

  const listField = (key: 'secondary_colours' | 'visible_fabric_characteristics' | 'visible_attributes') => ({
    tags: form[key],
    onChange: (next: string[]) => setForm((f) => ({ ...f, [key]: next })),
  });

  // ── Re-analyse ──────────────────────────────────────────────────────────────
  const handleAnalyse = async (force = true) => {
    setAnalysing(true);
    setError(null);
    setSaved(false);
    try {
      const attrs = await analyzeWardrobeItem(item.id, force);
      // Build updated item so parent state stays in sync
      const updated: WardrobeItem = {
        ...item,
        ai_attributes: attrs,
        ai_status: 'ready',
        ai_error: null,
        ai_analyzed_at: new Date().toISOString(),
      };
      onUpdated(updated);
      setForm(attrToForm(attrs));
    } catch (err) {
      console.error('[AI Analysis] handleAnalyse failed:', err);
      const msg = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
      setError(msg);
      onUpdated({ ...item, ai_status: 'failed', ai_error: msg });
    } finally {
      setAnalysing(false);
    }
  };

  // ── Confirm & Save ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const attributes = formToAttributes(form);
      const updated = await confirmItemAttributes(item.id, attributes);
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const isAnalysed = item.ai_status === 'ready' && !!item.ai_attributes;
  const isFailed   = item.ai_status === 'failed';
  const isNone     = item.ai_status === 'none';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-stone-900/50 backdrop-blur-sm fade-in overflow-y-auto">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl my-4 scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-stone-900">AI Clothing Analysis</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid md:grid-cols-[280px_1fr] gap-6">
          {/* ── Left: Image + status ─────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Item image */}
            <div className="relative aspect-square rounded-xl overflow-hidden bg-stone-100">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
                </div>
              )}

              {/* Overlay status */}
              {analysing && (
                <div className="absolute inset-0 bg-stone-900/60 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                  <p className="text-white text-sm font-medium">Analysing…</p>
                </div>
              )}
            </div>

            {/* Item name */}
            <div>
              <p className="font-semibold text-stone-900 truncate">{item.name}</p>
              <p className="text-sm text-stone-500 capitalize">{item.category}</p>
            </div>

            {/* Confidence bar */}
            {confidence !== null && <ConfidenceBar value={confidence} />}

            {/* AI status pill */}
            <div>
              {isNone && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-stone-100 text-stone-500 rounded-full">
                  Not yet analysed
                </span>
              )}
              {item.ai_status === 'analyzing' && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full">
                  <Loader2 className="w-3 h-3 animate-spin" /> Analysing…
                </span>
              )}
              {isAnalysed && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Analysis ready
                </span>
              )}
              {isFailed && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-red-50 text-red-700 rounded-full">
                  <AlertCircle className="w-3 h-3" /> Analysis failed
                </span>
              )}
            </div>

            {/* Analyse / Re-analyse button */}
            <button
              type="button"
              disabled={analysing || saving}
              onClick={() => handleAnalyse(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analysing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
              ) : isAnalysed ? (
                <><RefreshCw className="w-4 h-4" /> Re-analyse</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Analyse with AI</>
              )}
            </button>

            {item.ai_analyzed_at && (
              <p className="text-xs text-stone-400 text-center">
                Last analysed:{' '}
                {new Date(item.ai_analyzed_at).toLocaleString()}
              </p>
            )}
          </div>

          {/* ── Right: Editable attribute form ───────────────────────────── */}
          <div className="space-y-5">
            {(isNone || (!isAnalysed && !isFailed)) && !analysing && (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-center border-2 border-dashed border-stone-200 rounded-xl">
                <Sparkles className="w-10 h-10 text-stone-200" />
                <p className="text-sm text-stone-400 max-w-xs">
                  Click <strong>Analyse with AI</strong> to let Gemini detect clothing attributes from the photo.
                </p>
              </div>
            )}

            {(isAnalysed || isFailed || analysing) && (
              <>
                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">
                    <Tag className="inline w-3 h-3 mr-1" />Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="select-field py-2 text-sm"
                    disabled={analysing}
                  >
                    <option value="">Not detected</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Subcategory */}
                <div>
                  <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Subcategory</label>
                  <TextField {...field('subcategory')} placeholder="e.g. t-shirt, jeans, sneakers" />
                </div>

                {/* Colours */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Primary Colour</label>
                    <TextField {...field('primary_colour')} placeholder="e.g. Navy blue" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Colour Detail</label>
                    <TextField {...field('colour_details')} placeholder="e.g. Faded at knees" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Secondary Colours</label>
                  <TagList {...listField('secondary_colours')} />
                </div>

                {/* Pattern + Style */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Pattern</label>
                    <TextField {...field('pattern')} placeholder="e.g. Striped, Solid" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Style</label>
                    <TextField {...field('style')} placeholder="e.g. Casual, Formal" />
                  </div>
                </div>

                {/* Texture */}
                <div>
                  <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Texture</label>
                  <TextField {...field('texture')} placeholder="e.g. Smooth, Rough" />
                </div>

                {/* Fabric + visible attributes */}
                <div>
                  <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Visible Fabric Characteristics</label>
                  <TagList {...listField('visible_fabric_characteristics')} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5">Visible Attributes</label>
                  <TagList {...listField('visible_attributes')} />
                </div>
              </>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Save row */}
            {(isAnalysed || !!item.user_attributes) && (
              <div className="flex gap-3 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary flex-1"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={saving || analysing}
                  onClick={handleSave}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  ) : saved ? (
                    <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Confirm &amp; Save</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
