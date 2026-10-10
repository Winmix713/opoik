import { createClient } from "@supabase/supabase-js";

export interface SupabaseLiveStatus {
  state: "connected" | "not-configured" | "error";
  checkedAt: string;
  visibleCurrentVersion: string | null;
  visibleSeasonCount: number | null;
  visibleMatchCount: number | null;
  message: string;
}

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export async function checkSupabaseReadOnly(): Promise<SupabaseLiveStatus> {
  const checkedAt = new Date().toISOString();
  if (!projectUrl || !publishableKey) {
    return {
      state: "not-configured",
      checkedAt,
      visibleCurrentVersion: null,
      visibleSeasonCount: null,
      visibleMatchCount: null,
      message: "A böngészős Supabase-olvasáshoz nincs konfigurálva publishable klienskulcs. A GitHub-archívum auditja ettől függetlenül működik.",
    };
  }

  try {
    const client = createClient(projectUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "X-Client-Info": "winmix-pairing-audit/1.0" } },
    });
    const versionResult = await client
      .from("winmix_data_versions")
      .select("version_key,status,is_current")
      .eq("is_current", true)
      .limit(1);
    if (versionResult.error) throw versionResult.error;
    const version = versionResult.data?.[0];

    const [seasonResult, matchResult] = await Promise.all([
      client.from("winmix_seasons").select("id", { count: "exact", head: true }),
      client.from("winmix_matches").select("id", { count: "exact", head: true }),
    ]);
    if (seasonResult.error) throw seasonResult.error;
    if (matchResult.error) throw matchResult.error;

    return {
      state: "connected",
      checkedAt,
      visibleCurrentVersion: version?.version_key ?? null,
      visibleSeasonCount: seasonResult.count ?? 0,
      visibleMatchCount: matchResult.count ?? 0,
      message: version
        ? "A publikus kliens által látható aktuális verzió és sorok lekérdezése sikerült."
        : "A kapcsolat működik, de RLS-en keresztül nem látható aktuális publikált verzió. A draft adatok nem kerülnek be az archívumauditba.",
    };
  } catch (error) {
    return {
      state: "error",
      checkedAt,
      visibleCurrentVersion: null,
      visibleSeasonCount: null,
      visibleMatchCount: null,
      message: error instanceof Error ? error.message : "A Supabase csak olvasási lekérdezése sikertelen.",
    };
  }
}
