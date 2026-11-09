import "server-only";

import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_CATEGORIES = [
  "Verduras",
  "Proteínas",
  "Lácteos",
  "Granos",
  "Frutas",
  "Otros",
];

function normalizeIngredientName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ingredientMergeJobs = new Set<string>();

async function processIngredientSuggestionBatch(userId: string) {
  if (ingredientMergeJobs.has(userId)) return;
  ingredientMergeJobs.add(userId);

  try {
    const supabase = await createSupabaseServerClient();
    await mergePendingSuggestions(userId, supabase);
  } finally {
    ingredientMergeJobs.delete(userId);
  }
}

function inferEmoji(name: string) {
  const normalized = normalizeIngredientName(name);
  const emojiMap: Record<string, string> = {
    aguacate: "🥑",
    ajo: "🧅",
    arroz: "🍚",
    brocoli: "🥦",
    calabaza: "🎃",
    cebolla: "🧅",
    espinaca: "🥬",
    frijoles: "🫘",
    garbanzo: "🫘",
    huevo: "🥚",
    lenteja: "🥬",
    leche: "🥛",
    manzana: "🍏",
    mango: "🥭",
    pan: "🥖",
    pasta: "🍝",
    pimiento: "🫑",
    pollo: "🍗",
    queso: "🧀",
    sal: "🧂",
    sardina: "🐟",
    tomate: "🍅",
    tortilla: "🌮",
    atun: "🐟",
    salmon: "🐟",
    yogurt: "🥛",
    yogur: "🥛",
    aceite: "🫒",
    aceiteoliva: "🫒",
    aceitedeoliva: "🫒",
  };

  return emojiMap[normalized] ?? "🥕";
}

function sanitizeCategory(value: string | null | undefined) {
  const category = (value ?? "Otros").trim();
  if (!category) return "Otros";
  const normalized = category
    .replace(/\s+/g, " ")
    .trim();
  return DEFAULT_CATEGORIES.includes(normalized)
    ? normalized
    : normalized.length > 40
      ? normalized.slice(0, 40)
      : normalized;
}

function sanitizeIngredientPayload(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) return null;
  const category = sanitizeCategory(
    typeof record.category === "string" ? record.category : undefined,
  );
  const emoji =
    typeof record.emoji === "string" && record.emoji.trim().length > 0
      ? record.emoji.trim()
      : inferEmoji(name);

  return {
    name,
    category,
    emoji,
  };
}

async function getIngredients(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, category, emoji, normalized_name")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    category: ingredient.category ?? "Otros",
    emoji: ingredient.emoji ?? inferEmoji(ingredient.name),
  }));
}

async function mergePendingSuggestions(userId: string, supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: suggestions, error: suggestionsError } = await supabase
    .from("ingredient_suggestions")
    .select("id, name, normalized_name, user_id, category, emoji")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (suggestionsError) {
    throw suggestionsError;
  }

  const ingredients = await getIngredients(supabase);
  const existingKeys = new Set(
    ingredients.map((ingredient) => normalizeIngredientName(ingredient.name)),
  );
  const pendingNames = new Map<string, string>();

  for (const suggestion of suggestions ?? []) {
    const key = normalizeIngredientName(suggestion.name);
    if (!key || existingKeys.has(key) || pendingNames.has(key)) continue;
    pendingNames.set(key, suggestion.name.trim());
  }

  if (pendingNames.size === 0) {
    await supabase.from("ingredient_suggestions").delete().eq("user_id", userId);
    return { inserted: [], ingredients: await getIngredients(supabase) };
  }

  const apiKey = process.env.AI_MODEL_API_KEY ?? process.env.AI_API_KEY;
  const model = process.env.AI_MODEL ?? "gemini-3.6-flash";
  const baseUrl = process.env.AI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";

  const prompt = [
    "Compara esta lista de ingredientes nuevos contra la lista de ingredientes ya existentes.",
    "Ignora duplicados, variantes con letras distintas, nombres casi iguales, y nombres con diferencias de acentos o singular/plural.",
    "Devuelve SOLAMENTE un JSON válido con este formato:",
    '{"items":[{"name":"...","category":"Verduras|Proteínas|Lácteos|Granos|Frutas|Otros","emoji":"🥕"}]}',
    "Regresa SOLO los ingredientes realmente nuevos, nunca los que ya existen ni los duplicados.",
    "Lista actual de ingredientes existentes:",
    JSON.stringify(ingredients.map((ingredient) => ingredient.name)),
    "Lista nueva de sugerencias del usuario:",
    JSON.stringify(Array.from(pendingNames.values())),
  ].join("\n");

  const inserted: Array<{ id: string; name: string; category: string; emoji: string }> = [];

  if (!apiKey) {
    await supabase.from("ingredient_suggestions").delete().eq("user_id", userId);
    return { inserted, ingredients: await getIngredients(supabase) };
  }

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  const rawText =
    payload?.candidates?.[0]?.content?.parts?.[0]?.text ??
    payload?.text ??
    "{}";

  let parsed: { items?: unknown[] } | null = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = String(rawText).match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }

  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const finalItems = items
    .map((item) => sanitizeIngredientPayload(item))
    .filter((item): item is { name: string; category: string; emoji: string } => !!item);

  for (const item of finalItems) {
    const normalizedItemName = normalizeIngredientName(item.name);
    if (!normalizedItemName || existingKeys.has(normalizedItemName)) continue;

    const { data: insertedRow, error: insertError } = await supabase
      .from("ingredients")
      .upsert(
        {
          name: item.name,
          normalized_name: normalizedItemName,
          category: item.category,
          emoji: item.emoji,
          description: "Ingrediente añadido desde la despensa del usuario.",
          is_active: true,
        },
        { onConflict: "name" },
      )
      .select("id, name, category, emoji")
      .single();

    if (insertError) {
      continue;
    }

    inserted.push({
      id: insertedRow.id,
      name: insertedRow.name,
      category: insertedRow.category ?? "Otros",
      emoji: insertedRow.emoji ?? inferEmoji(insertedRow.name),
    });
    existingKeys.add(normalizedItemName);
  }

  await supabase.from("ingredient_suggestions").delete().eq("user_id", userId);

  return {
    inserted,
    ingredients: await getIngredients(supabase),
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const ingredients = await getIngredients(supabase);
    return NextResponse.json({ ingredients });
  } catch (error) {
    console.error("Ingredient fetch failed:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los ingredientes." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envía un nombre de ingrediente válido." },
      { status: 400 },
    );
  }

  if (typeof payload !== "object" || payload === null || !("name" in payload)) {
    return NextResponse.json(
      { error: "Falta el nombre del ingrediente." },
      { status: 400 },
    );
  }

  const rawIngredient = payload.name;
  if (typeof rawIngredient !== "string") {
    return NextResponse.json(
      { error: "El nombre del ingrediente debe ser texto." },
      { status: 400 },
    );
  }

  const ingredientName = rawIngredient.trim();
  if (!ingredientName) {
    return NextResponse.json(
      { error: "No puedes enviar un ingrediente vacío." },
      { status: 400 },
    );
  }

  try {
    const { user, error: authError } = await getAuthenticatedProfile();
    if (!user || authError) {
      return NextResponse.json(
        { error: "Inicia sesión para añadir ingredientes a la despensa." },
        { status: 401 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const ingredients = await getIngredients(supabase);
    const normalized = normalizeIngredientName(ingredientName);
    const existing = ingredients.find(
      (ingredient) => normalizeIngredientName(ingredient.name) === normalized,
    );

    if (existing) {
      return NextResponse.json({
        ok: true,
        exists: true,
        ingredient: existing,
        ingredients,
      });
    }

    const { data: pendingSuggestions, error: pendingError } = await supabase
      .from("ingredient_suggestions")
      .select("id")
      .eq("user_id", user.id);

    if (pendingError) {
      throw pendingError;
    }

    const { error: insertError } = await supabase.from("ingredient_suggestions").upsert(
      {
        user_id: user.id,
        name: ingredientName,
        normalized_name: normalized,
        category: null,
        emoji: inferEmoji(ingredientName),
        status: "pending",
      },
      { onConflict: "user_id,normalized_name" },
    );

    if (insertError) {
      throw insertError;
    }

    const mergedCount = (pendingSuggestions ?? []).length + 1;
    if (mergedCount >= 10) {
      void processIngredientSuggestionBatch(user.id);
      return NextResponse.json({
        ok: true,
        queued: false,
        processing: true,
        message: "Se está consolidando la lista de ingredientes en segundo plano.",
        ingredients: await getIngredients(supabase),
      });
    }

    const nextIngredients = await getIngredients(supabase);
    return NextResponse.json({
      ok: true,
      queued: true,
      pendingCount: mergedCount,
      ingredients: nextIngredients,
    });
  } catch (error) {
    console.error("Ingredient save failed:", error);
    return NextResponse.json(
      { error: "No se pudo guardar el ingrediente." },
      { status: 500 },
    );
  }
}
