import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const GNANI_URL = "https://api.vachana.ai/stt/v3";
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["wav", "mp3", "ogg", "flac", "aac", "m4a"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Please sign in before uploading audio." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const gnaniKey = Deno.env.get("GNANI_API_KEY");
    if (!supabaseUrl || !anonKey || !gnaniKey) {
      console.error("transcribe-audio is missing server configuration");
      return json({ error: "Audio transcription is not configured. Add the GNANI_API_KEY Edge Function secret." }, 500);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Your session has expired. Please sign in again." }, 401);

    const incoming = await req.formData();
    const candidate = incoming.get("audio_file");
    if (!(candidate instanceof File)) return json({ error: "Choose an audio file to transcribe." }, 400);

    const extension = candidate.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return json({ error: "Supported formats are WAV, MP3, OGG, FLAC, AAC and M4A." }, 415);
    }
    if (candidate.size === 0 || candidate.size > MAX_AUDIO_BYTES) {
      return json({ error: "Choose a non-empty audio file smaller than 5 MB." }, 413);
    }

    const gnaniForm = new FormData();
    gnaniForm.append("audio_file", candidate, candidate.name);
    gnaniForm.append("model", "prisma-v3.0");
    gnaniForm.append("language_code", "indic-auto");
    gnaniForm.append("format", "codemix");
    gnaniForm.append("topic", "A short spoken request for AI outfit recommendations and clothing style preferences");

    const upstream = await fetch(GNANI_URL, {
      method: "POST",
      headers: { "X-API-Key-ID": gnaniKey },
      body: gnaniForm,
    });
    const payload = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      console.error("Gnani transcription failed", upstream.status, payload?.error?.type ?? payload?.code ?? "unknown");
      if (upstream.status === 401 || upstream.status === 403) {
        return json({ error: "Gnani rejected the API key. Check the GNANI_API_KEY secret." }, 502);
      }
      if (upstream.status === 429) return json({ error: "Gnani usage limit reached. Please try again later." }, 429);
      if (upstream.status === 504) return json({ error: "Gnani could not transcribe this clip in time. Try a shorter recording." }, 504);
      const detail = typeof payload?.error?.message === "string" ? payload.error.message : "Check that the clip is supported and no longer than 30 seconds.";
      return json({ error: `Gnani could not process this audio. ${detail}` }, upstream.status >= 400 && upstream.status < 500 ? 422 : 502);
    }

    const transcript = typeof payload?.transcript === "string" ? payload.transcript.trim() : "";
    return json({
      transcript,
      detectedLanguageCode: typeof payload?.detected_language_code === "string" ? payload.detected_language_code : null,
    });
  } catch (error) {
    console.error("transcribe-audio failed", error instanceof Error ? error.message : error);
    return json({ error: "Could not transcribe this recording. Please try again." }, 500);
  }
});
