import { after, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";

export const maxDuration = 60;

type DietaryKind = "allergy" | "intolerance" | "dislike";

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function optionId(type: DietaryKind, normalizedName: string) {
  const slug = normalizedName.replace(/\s+/g, "_");
  return `${type}:${slug}`;
}

async function processSuggestions(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: suggestions, error: suggestionsError } = await admin
    .from("dietary_suggestions")
    .select("id, name, normalized_name")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (suggestionsError) throw suggestionsError;
  if (!suggestions?.length) return;

  const { data: existingOptions, error: optionsError } = await admin
    .from("dietary_options")
    .select("id, name, type, normalized_name, match_terms")
    .neq("type", "dislike");

  if (optionsError) throw optionsError;

  const apiKey = process.env.AI_MODEL_API_KEY ?? process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_MODEL_API_KEY is required to classify dietary suggestions.");

  const baseUrl = process.env.AI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
  const model = process.env.AI_MODEL ?? "gemini-3.6-flash";
  const prompt = [
    "Clasifica las propuestas nuevas como alergia o intolerancia alimentaria.",
    "Compara cuidadosamente contra las opciones existentes y no devuelvas duplicados, sinónimos, variantes ortográficas, acentos o singular/plural equivalentes.",
    "Solo devuelve elementos que representen una restricción distinta y útil. No inventes opciones.",
    "El campo name debe copiar exactamente uno de los nombres propuestos. Incluye términos y alimentos relacionados que deben bloquearse como matchTerms.",
    "Devuelve solo JSON con forma {\"items\":[{\"name\":\"...\",\"type\":\"allergy|intolerance\",\"matchTerms\":[\"...\",\"...\"]}]}",
    "Opciones existentes:",
    JSON.stringify(
      (existingOptions ?? []).map((option) => ({
        name: option.name,
        type: option.type,
        matchTerms: option.match_terms,
      })),
    ),
    "Nuevas propuestas:",
    JSON.stringify(suggestions.map((suggestion) => suggestion.name)),
  ].join("\n");

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Gemini dietary classification failed with status ${response.status}.`);
  }

  const responseText =
    typeof payload === "object" &&
    payload !== null &&
    "candidates" in payload &&
    Array.isArray(payload.candidates) &&
    typeof payload.candidates[0] === "object" &&
    payload.candidates[0] !== null &&
    "content" in payload.candidates[0] &&
    typeof payload.candidates[0].content === "object" &&
    payload.candidates[0].content !== null &&
    "parts" in payload.candidates[0].content &&
    Array.isArray(payload.candidates[0].content.parts) &&
    typeof payload.candidates[0].content.parts[0] === "object" &&
    payload.candidates[0].content.parts[0] !== null &&
    "text" in payload.candidates[0].content.parts[0] &&
    typeof payload.candidates[0].content.parts[0].text === "string"
      ? payload.candidates[0].content.parts[0].text
      : "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error("Gemini returned invalid dietary classification JSON.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("items" in parsed) ||
    !Array.isArray(parsed.items)
  ) {
    throw new Error("Gemini returned an invalid dietary classification shape.");
  }

  const existingKeys = new Set(
    (existingOptions ?? []).map((option) => `${option.type}:${option.normalized_name}`),
  );
  const suggestionsByKey = new Set(
    suggestions.map((suggestion) => suggestion.normalized_name),
  );
  const seen = new Set<string>();
  const additions: Array<{
    id: string;
    name: string;
    type: DietaryKind;
    normalized_name: string;
    match_terms: string[];
    created_by: string;
  }> = [];

  for (const rawItem of parsed.items.slice(0, 10)) {
    if (typeof rawItem !== "object" || rawItem === null) continue;
    const item = rawItem as Record<string, unknown>;
    if (
      typeof item.name !== "string" ||
      (item.type !== "allergy" && item.type !== "intolerance")
    ) {
      continue;
    }

    const name = item.name.trim().slice(0, 100);
    const normalizedName = normalizeName(name);
    if (
      !name ||
      !normalizedName ||
      !suggestionsByKey.has(normalizedName) ||
      !Array.isArray(item.matchTerms) ||
      item.matchTerms.length > 30 ||
      !item.matchTerms.every(
        (term) => typeof term === "string" && term.length <= 100,
      )
    ) {
      continue;
    }

    const type = item.type;
    const key = `${type}:${normalizedName}`;
    if (existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    additions.push({
      id: optionId(type, normalizedName),
      name,
      type,
      normalized_name: normalizedName,
      match_terms: [
        ...new Set(
          [name, ...item.matchTerms]
            .map((term) => normalizeName(term).slice(0, 100))
            .filter(Boolean),
        ),
      ],
      created_by: userId,
    });
  }

  if (additions.length > 0) {
    const { error: insertError } = await admin
      .from("dietary_options")
      .upsert(additions, { onConflict: "type,normalized_name", ignoreDuplicates: true });
    if (insertError) throw insertError;

    const { data: storedOptions, error: storedError } = await admin
      .from("dietary_options")
      .select("id, normalized_name")
      .in("id", additions.map((item) => item.id));
    if (storedError) throw storedError;

    const optionIds = (storedOptions ?? []).map((item) => item.id);
    if (optionIds.length > 0) {
      const { error: preferenceError } = await admin
        .from("user_dietary_preferences")
        .upsert(
          optionIds.map((optionId) => ({ user_id: userId, option_id: optionId })),
          { onConflict: "user_id,option_id", ignoreDuplicates: true },
        );
      if (preferenceError) throw preferenceError;
    }
  }

  const { error: deleteError } = await admin
    .from("dietary_suggestions")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw deleteError;
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedProfile();
    const { data: sharedOptions, error: optionsError } = await supabase
      .from("dietary_options")
      .select("id, name, type, match_terms")
      .neq("type", "dislike")
      .order("name", { ascending: true });
    if (optionsError) throw optionsError;

    let selectedIds: string[] = [];
    let selectedDislikes: typeof sharedOptions = [];
    if (user) {
      const { data: preferences, error: preferencesError } = await supabase
        .from("user_dietary_preferences")
        .select("option_id")
        .eq("user_id", user.id);
      if (preferencesError) throw preferencesError;
      selectedIds = (preferences ?? []).map((item) => item.option_id);
      if (selectedIds.length > 0) {
        const { data: dislikes, error: dislikesError } = await supabase
          .from("dietary_options")
          .select("id, name, type, match_terms")
          .in("id", selectedIds)
          .eq("type", "dislike");
        if (dislikesError) throw dislikesError;
        selectedDislikes = dislikes ?? [];
      }
    }

    return NextResponse.json({
      options: [...(sharedOptions ?? []), ...selectedDislikes],
      selectedIds,
      authenticated: Boolean(user),
    });
  } catch (error) {
    console.error("Dietary options query failed:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar las opciones alimentarias." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Envía un nombre válido." }, { status: 400 });
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "dislikeIngredient" in body &&
    typeof body.dislikeIngredient === "string" &&
    "enabled" in body &&
    typeof body.enabled === "boolean"
  ) {
    const name = body.dislikeIngredient.trim().slice(0, 100);
    const normalizedName = normalizeName(name);
    if (!name || !normalizedName) {
      return NextResponse.json({ error: "El ingrediente no es válido." }, { status: 400 });
    }

    try {
      const { supabase, user } = await getAuthenticatedProfile();
      if (!user) {
        return NextResponse.json(
          { error: "Inicia sesión para guardar los ingredientes que no te gustan." },
          { status: 401 },
        );
      }

      const admin = createSupabaseAdminClient();
      const id = optionId("dislike", normalizedName);
      if (body.enabled) {
        const { error: optionError } = await admin.from("dietary_options").upsert(
          {
            id,
            name,
            type: "dislike",
            normalized_name: normalizedName,
            match_terms: [name],
            created_by: user.id,
          },
          { onConflict: "type,normalized_name", ignoreDuplicates: true },
        );
        if (optionError) throw optionError;

        const { error: preferenceError } = await supabase
          .from("user_dietary_preferences")
          .upsert(
            { user_id: user.id, option_id: id },
            { onConflict: "user_id,option_id" },
          );
        if (preferenceError) throw preferenceError;
      } else {
        const { data: existing, error: existingError } = await supabase
          .from("dietary_options")
          .select("id")
          .eq("type", "dislike")
          .eq("normalized_name", normalizedName)
          .maybeSingle();
        if (existingError) throw existingError;
        if (existing) {
          const { error: preferenceError } = await supabase
            .from("user_dietary_preferences")
            .delete()
            .eq("user_id", user.id)
            .eq("option_id", existing.id);
          if (preferenceError) throw preferenceError;
        }
      }

      return NextResponse.json({ ok: true, optionId: id, selected: body.enabled });
    } catch (error) {
      console.error("Disliked ingredient update failed:", error);
      return NextResponse.json(
        { error: "No se pudo actualizar el ingrediente que no te gusta." },
        { status: 500 },
      );
    }
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body) ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 100
  ) {
    return NextResponse.json(
      { error: "Escribe un nombre de alergia o intolerancia de hasta 100 caracteres." },
      { status: 400 },
    );
  }

  try {
    const { supabase, user } = await getAuthenticatedProfile();
    if (!user) {
      return NextResponse.json(
        { error: "Inicia sesión para proponer una restricción alimentaria." },
        { status: 401 },
      );
    }

    const name = body.name.trim();
    const normalizedName = normalizeName(name);
    const { data: existing, error: existingError } = await supabase
      .from("dietary_options")
      .select("name")
      .eq("normalized_name", normalizedName)
      .neq("type", "dislike")
      .limit(1);
    if (existingError) throw existingError;
    if (existing?.length) {
      return NextResponse.json({
        ok: true,
        exists: true,
        message: "Esa opción ya está disponible.",
      });
    }

    const { error: insertError } = await supabase
      .from("dietary_suggestions")
      .upsert(
        { user_id: user.id, name, normalized_name: normalizedName },
        { onConflict: "user_id,normalized_name", ignoreDuplicates: true },
      );
    if (insertError) throw insertError;

    const { count, error: countError } = await supabase
      .from("dietary_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (countError) throw countError;

    if ((count ?? 0) >= 10) {
      after(async () => {
        try {
          await processSuggestions(user.id);
        } catch (error) {
          console.error("Dietary suggestion processing failed:", error);
        }
      });
      return NextResponse.json({ ok: true, processing: true, pendingCount: count });
    }

    return NextResponse.json({ ok: true, queued: true, pendingCount: count });
  } catch (error) {
    console.error("Dietary suggestion save failed:", error);
    return NextResponse.json(
      { error: "No se pudo guardar la nueva opción alimentaria." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Envía una preferencia válida." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("optionId" in body) ||
    typeof body.optionId !== "string" ||
    !("enabled" in body) ||
    typeof body.enabled !== "boolean"
  ) {
    return NextResponse.json({ error: "Especifica la preferencia que deseas cambiar." }, { status: 400 });
  }

  try {
    const { supabase, user } = await getAuthenticatedProfile();
    if (!user) {
      return NextResponse.json(
        { error: "Inicia sesión para guardar tus preferencias." },
        { status: 401 },
      );
    }

    const { data: option, error: optionError } = await supabase
      .from("dietary_options")
      .select("id")
      .eq("id", body.optionId)
      .maybeSingle();
    if (optionError) throw optionError;
    if (!option) {
      return NextResponse.json({ error: "La opción ya no está disponible." }, { status: 404 });
    }

    if (body.enabled) {
      const { error: preferenceError } = await supabase
        .from("user_dietary_preferences")
        .upsert(
          { user_id: user.id, option_id: body.optionId },
          { onConflict: "user_id,option_id" },
        );
      if (preferenceError) throw preferenceError;
    } else {
      const { error: preferenceError } = await supabase
        .from("user_dietary_preferences")
        .delete()
        .eq("user_id", user.id)
        .eq("option_id", body.optionId);
      if (preferenceError) throw preferenceError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Dietary preference update failed:", error);
    return NextResponse.json(
      { error: "No se pudo actualizar la preferencia." },
      { status: 500 },
    );
  }
}
