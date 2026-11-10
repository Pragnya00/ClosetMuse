import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Primary model: free-tier, multimodal (image input), supports structured JSON output.
// Previous model, kept as a possible future fallback (not wired up yet): "gemini-3.8-flash"
const MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const BUCKET = "wardrobe-images";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const CATEGORIES = ["tops", "bottoms", "outerwear", "dresses", "shoes", "accessories", "other"];

const PROMPT = `You are analysing a photo of a single clothing item for a digital wardrobe.
Return only the JSON object described by the schema.
- category: one of tops, bottoms, outerwear, dresses, shoes, accessories, other. Use null if unsure.
- subcategory: specific garment type such as "t-shirt", "jeans", "midi dress", "sneakers". Use null if unsure.
- primary_colour: the dominant colour name. Use null if unsure.
- secondary_colours: other visible colour names, or an empty array.
- colour_details: short note on shade or colour placement, or null.
- pattern: such as solid, striped, checked, floral, polka dot, graphic print. Use null if unsure.
- visible_fabric_characteristics: visible fabric qualities such as denim, knit, woven, sheen, ribbed. Empty array if none are visible.
- texture: short description of surface texture, or null.
- style: such as casual, smart casual, formal, sporty, streetwear, or null.
- visible_attributes: other notable visible details such as buttons, zip, collar, logo, sole type. Empty array if none.
- confidence: number from 0 to 1 for how confident you are about this analysis overall.
Only describe what is visible. Never guess a brand.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING", nullable: true },
    subcategory: { type: "STRING", nullable: true },
    primary_colour: { type: "STRING", nullable: true },
    secondary_colours: { type: "ARRAY", items: { type: "STRING" } },
    colour_details: { type: "STRING", nullable: true },
    pattern: { type: "STRING", nullable: true },
    visible_fabric_characteristics: { type: "ARRAY", items: { type: "STRING" } },
    texture: { type: "STRING", nullable: true },
    style: { type: "STRING", nullable: true },
    visible_attributes: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "NUMBER" },
  },
  required: [
    "category",
    "subcategory",
    "primary_colour",
    "secondary_colours",
    "colour_details",
    "pattern",
    "visible_fabric_characteristics",
    "texture",
    "style",
    "visible_attributes",
    "confidence",
  ],
};

type Attributes = {
  category: string | null;
  subcategory: string | null;
  primary_colour: string | null;
  secondary_colours: string[];
  colour_details: string | null;
  pattern: string | null;
  visible_fabric_characteristics: string[];
  texture: string | null;
  style: string | null;
  visible_attributes: string[];
  confidence: number;
};

class AnalysisError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

const cleanText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 80);
  if (!trimmed || trimmed.toLowerCase() === "unknown" || trimmed.toLowerCase() === "null") return null;
  return trimmed;
};

const cleanList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(cleanText)
    .filter((v): v is string => v !== null)
    .slice(0, 12);
};

export function validateAttributes(raw: unknown): Attributes {
  if (!raw || typeof raw !== "object") {
    throw new AnalysisError("The AI response was not in the expected format.", 502, "invalid_response");
  }
  const r = raw as Record<string, unknown>;
  const category = cleanText(r.category)?.toLowerCase() ?? null;
  const confidenceNumber = typeof r.confidence === "number" ? r.confidence : 0;
  return {
    category: category && CATEGORIES.includes(category) ? category : null,
    subcategory: cleanText(r.subcategory),
    primary_colour: cleanText(r.primary_colour),
    secondary_colours: cleanList(r.secondary_colours),
    colour_details: cleanText(r.colour_details),
    pattern: cleanText(r.pattern),
    visible_fabric_characteristics: cleanList(r.visible_fabric_characteristics),
    texture: cleanText(r.texture),
    style: cleanText(r.style),
    visible_attributes: cleanList(r.visible_attributes),
    confidence: Math.min(1, Math.max(0, Number.isFinite(confidenceNumber) ? confidenceNumber : 0)),
  };
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 2; // one initial request + one retry
const BASE_DELAY_MS = 1000;
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Random 0–500 ms jitter to avoid thundering-herd retries. */
const jitter = (): number => Math.random() * 500;

/**
 * Determine how long to wait before the next retry.
 * Priority: Retry-After header → Google retryDelay field → exponential backoff.
 */
function getRetryDelay(response: Response, errorBody: string, attempt: number): number {
  // 1. Standard Retry-After header (value in seconds)
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= 60) {
      return seconds * 1000 + jitter();
    }
  }

  // 2. Google error body: { error: { details: [{ retryDelay: "1.5s" }] } }
  try {
    const parsed = JSON.parse(errorBody);
    const details = parsed?.error?.details;
    if (Array.isArray(details)) {
      for (const detail of details) {
        const delayStr = detail?.retryDelay;
        if (typeof delayStr === "string") {
          const match = delayStr.match(/^(\d+(?:\.\d+)?)s$/);
          if (match) {
            const seconds = parseFloat(match[1]);
            if (seconds > 0 && seconds <= 60) {
              return seconds * 1000 + jitter();
            }
          }
        }
      }
    }
  } catch {
    // Body wasn't JSON — fall through to default
  }

  // 3. Default exponential backoff: ~1 s before the single retry
  return BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter();
}

/**
 * Returns true when a 429 body indicates hard quota exhaustion rather than
 * a temporary per-minute rate limit.  Quota exhaustion should NOT be retried.
 */
function isQuotaExhaustion(errorBody: string): boolean {
  try {
    const parsed = JSON.parse(errorBody);
    const status: unknown = parsed?.error?.status;
    if (status === "RESOURCE_EXHAUSTED") return true;
    const message: unknown = parsed?.error?.message;
    if (typeof message === "string") {
      const lower = message.toLowerCase();
      if (lower.includes("quota") || lower.includes("resource exhausted") || lower.includes("billing")) {
        return true;
      }
    }
  } catch {
    // Not JSON — treat as temporary
  }
  return false;
}

// ---------------------------------------------------------------------------
// Gemini request with retry
// ---------------------------------------------------------------------------

async function callGemini(bytes: Uint8Array, mimeType: string, apiKey: string): Promise<Attributes> {
  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: toBase64(bytes) } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  let lastError: AnalysisError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: requestBody,
    });

    // ---- Success ----
    if (response.ok) {
      if (attempt > 1) {
        console.log(`[Gemini] Succeeded on attempt ${attempt}/${MAX_ATTEMPTS}`);
      }
      const payload = await response.json();
      const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") {
        throw new AnalysisError("The AI returned no analysis for this photo.", 502, "empty_response");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new AnalysisError("The AI response could not be read. Please try again.", 502, "invalid_json");
      }
      return validateAttributes(parsed);
    }

    // ---- Failure — read body for logging & classification ----
    const errorBody = await response.text().catch(() => "");
    console.error(
      `[Gemini] Attempt ${attempt}/${MAX_ATTEMPTS} failed [${response.status}]:`,
      errorBody,
    );

    // ---- Permanent errors — do NOT retry ----
    if (response.status === 400) {
      throw new AnalysisError(
        "The request to the AI service was invalid.",
        502,
        "bad_request",
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new AnalysisError(
        "The AI service rejected the request. Please check the API key configuration.",
        502,
        "auth_error",
      );
    }

    // ---- 429 — distinguish temporary rate-limit from quota exhaustion ----
    if (response.status === 429) {
      if (isQuotaExhaustion(errorBody)) {
        throw new AnalysisError(
          "The free AI usage quota has been exhausted. Please try again later or check your API quota.",
          429,
          "quota_exhausted",
        );
      }
      lastError = new AnalysisError(
        "The free AI usage limit has been reached for now. Please try again in a minute.",
        429,
        "rate_limited",
      );
    } else if (RETRYABLE_STATUSES.has(response.status)) {
      // ---- 5xx — retryable ----
      lastError = new AnalysisError(
        response.status === 503
          ? "The AI service is temporarily busy. Please try again in a moment."
          : "The AI service encountered an error. Please try again.",
        502,
        "upstream_error",
      );
    } else {
      // ---- Unknown status — not retryable ----
      throw new AnalysisError(
        "The AI service could not analyse this photo. Please try again.",
        502,
        "upstream_error",
      );
    }

    // ---- Wait before next attempt (skip sleep on final attempt) ----
    if (attempt < MAX_ATTEMPTS) {
      const delay = getRetryDelay(response, errorBody, attempt);
      console.log(`[Gemini] Retrying in ${Math.round(delay)} ms (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
      await sleep(delay);
    }
  }

  // All attempts exhausted
  throw lastError ?? new AnalysisError("The analysis failed. Please try again.", 502, "upstream_error");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Please sign in to analyse items." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!supabaseUrl || !anonKey || !geminiKey) {
      console.error("Missing required function configuration");
      return json({ error: "The analysis service is not configured." }, 500);
    }

    const body = await req.json().catch(() => null);
    const itemId = typeof body?.itemId === "string" ? body.itemId : null;
    const force = body?.force === true;
    if (!itemId || !/^[0-9a-f-]{36}$/i.test(itemId)) {
      return json({ error: "A valid item id is required." }, 400);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Your session has expired. Please sign in again." }, 401);
    }

    const { data: item, error: itemError } = await supabase
      .from("wardrobe_items")
      .select("id, image_path, ai_status, ai_image_hash, ai_attributes, ai_analyzed_at")
      .eq("id", itemId)
      .maybeSingle();

    if (itemError) {
      console.error("Item lookup failed", itemError.message);
      return json({ error: "Could not load this item." }, 500);
    }
    if (!item) {
      return json({ error: "This item was not found." }, 404);
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(item.image_path);
    if (downloadError || !blob) {
      console.error("Image download failed", downloadError?.message);
      return json({ error: "The photo for this item could not be loaded." }, 404);
    }
    if (blob.size === 0 || blob.size > MAX_IMAGE_BYTES) {
      return json({ error: "This photo is empty or too large to analyse." }, 400);
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const imageHash = await sha256Hex(bytes);

    if (!force && item.ai_status === "ready" && item.ai_image_hash === imageHash && item.ai_attributes) {
      return json({
        attributes: item.ai_attributes,
        analyzedAt: item.ai_analyzed_at,
        cached: true,
      });
    }

    await supabase
      .from("wardrobe_items")
      .update({ ai_status: "analyzing", ai_error: null })
      .eq("id", itemId);

    try {
      const attributes = await callGemini(bytes, blob.type || "image/jpeg", geminiKey);
      const analyzedAt = new Date().toISOString();
      const { error: saveError } = await supabase
        .from("wardrobe_items")
        .update({
          ai_attributes: attributes,
          ai_status: "ready",
          ai_error: null,
          ai_image_hash: imageHash,
          ai_analyzed_at: analyzedAt,
        })
        .eq("id", itemId);
      if (saveError) {
        console.error("Saving analysis failed", saveError.message);
        return json({ error: "The analysis finished but could not be saved. Please try again." }, 500);
      }
      return json({ attributes, analyzedAt, cached: false });
    } catch (err) {
      const message =
        err instanceof AnalysisError ? err.message : "The analysis failed. Please try again.";
      await supabase
        .from("wardrobe_items")
        .update({ ai_status: "failed", ai_error: message })
        .eq("id", itemId);
      if (err instanceof AnalysisError) {
        return json({ error: message, code: err.code }, err.status);
      }
      throw err;
    }
  } catch (err) {
    console.error("analyze-clothing failed", err instanceof Error ? err.message : err);
    return json({ error: "Something went wrong while analysing this item." }, 500);
  }
});