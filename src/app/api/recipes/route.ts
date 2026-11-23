import { NextResponse } from "next/server";
import {
  allergyOptions,
  findDietaryConflicts,
  findNamedDietaryConflicts,
  intoleranceOptions,
} from "@/lib/dietary";
import { dedupeRecipeStrings, isRecipeData, type RecipeData } from "@/lib/recipe";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stabilizeRecipeImage } from "@/lib/supabase/recipe-images";

function recipeToApiShape(row: Record<string, unknown>): RecipeData {
  const macros = (
    typeof row.macros === "object" && row.macros !== null
      ? row.macros
      : {
          protein: 0,
          carbs: 0,
          fats: 0,
        }
  ) as Record<string, unknown>;

  return {
    title: String(row.title ?? "Receta"),
    prepTime: String(row.prep_time ?? "30 min"),
    calories: Number(row.calories ?? 0),
    macros: {
      protein: Number(macros.protein ?? 0),
      carbs: Number(macros.carbs ?? 0),
      fats: Number(macros.fats ?? 0),
    },
    matchPercentage: Number(row.match_percentage ?? 100),
    usedIngredients: Array.isArray(row.used_ingredients)
      ? row.used_ingredients.filter((item): item is string => typeof item === "string")
      : [],
    steps: Array.isArray(row.steps)
      ? row.steps.filter((item): item is string => typeof item === "string")
      : [],
    imageUrl: typeof row.image_url === "string" ? row.image_url : undefined,
    imagePhotographer:
      typeof row.image_photographer === "string"
        ? row.image_photographer
        : undefined,
    imageSourceUrl:
      typeof row.image_source_url === "string"
        ? row.image_source_url
        : undefined,
  };
}

function normalizeIngredient(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const selectedIngredients = (searchParams.get("ingredients") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const { supabase, profile, user, error } = await getAuthenticatedProfile();
  if (error && user) {
    return NextResponse.json(
      { error: "No se pudo cargar tu perfil alimentario." },
      { status: 503 },
    );
  }

  const { data, error: queryError } = await supabase
    .from("recipes")
    .select("id, title, prep_time, calories, macros, used_ingredients, steps, image_url, image_photographer, image_source_url, match_percentage, created_by, created_at")
    .order("created_at", { ascending: false });

  if (queryError) {
    console.error("Explore recipes query failed:", queryError.code);
    return NextResponse.json(
      { error: "No se pudieron cargar las recetas del explorador." },
      { status: 500 },
    );
  }

  const allergies = profile?.allergies ?? [];
  const intolerances = profile?.intolerances ?? [];
  let customRestrictions: Array<{ name: string; matchTerms: string[] }> = [];
  let dislikedIngredients: string[] = [];

  if (user) {
    const { data: preferences, error: preferencesError } = await supabase
      .from("user_dietary_preferences")
      .select("option_id")
      .eq("user_id", user.id);
    if (preferencesError) {
      console.error("Explore dietary preference lookup failed:", preferencesError.code);
      return NextResponse.json(
        { error: "No se pudieron cargar tus restricciones alimentarias." },
        { status: 503 },
      );
    }

    const optionIds = (preferences ?? []).map((preference) => preference.option_id);
    if (optionIds.length > 0) {
      const legacyOptionIds = new Set([
        ...allergyOptions.map((option) => `allergy:${option.id}`),
        ...intoleranceOptions.map((option) => `intolerance:${option.id}`),
      ]);
      const { data: options, error: optionsError } = await supabase
        .from("dietary_options")
        .select("id, name, type, match_terms")
        .in("id", optionIds);
      if (optionsError) {
        console.error("Explore dietary options lookup failed:", optionsError.code);
        return NextResponse.json(
          { error: "No se pudieron cargar tus restricciones alimentarias." },
          { status: 503 },
        );
      }

      customRestrictions = (options ?? [])
        .filter((option) => option.type !== "dislike" && !legacyOptionIds.has(option.id))
        .map((option) => ({ name: option.name, matchTerms: option.match_terms ?? [] }));
      dislikedIngredients = (options ?? [])
        .filter((option) => option.type === "dislike")
        .flatMap((option) => [option.name, ...(option.match_terms ?? [])]);
    }
  }

  const recipes = (await Promise.all(
    (data ?? []).map(async (row) => {
      const recipe = recipeToApiShape(row as Record<string, unknown>);
      if (!isRecipeData(recipe)) return null;

      const originalImageUrl = recipe.imageUrl;
      recipe.imageUrl = await stabilizeRecipeImage(originalImageUrl);
      if (
        row.id &&
        originalImageUrl &&
        originalImageUrl !== recipe.imageUrl
      ) {
        const { error: imageUpdateError } = await createSupabaseAdminClient()
          .from("recipes")
          .update({
            image_url: recipe.imageUrl ?? null,
            ...(recipe.imageUrl
              ? {}
              : { image_photographer: null, image_source_url: null }),
          })
          .eq("id", row.id);
        if (imageUpdateError) {
          console.warn("Persisted recipe image URL update failed:", imageUpdateError.code);
        }
      }

      return recipe;
    }),
  ))
    .filter((recipe): recipe is RecipeData => recipe !== null)
    .filter((recipe) => {
      const recipeText = [recipe.title, ...recipe.usedIngredients, ...recipe.steps].join(" ");
      const customConflicts = findNamedDietaryConflicts(recipeText, customRestrictions);
      const dislikeConflicts = findNamedDietaryConflicts(
        [recipe.title, ...recipe.usedIngredients].join(" "),
        dislikedIngredients.map((name) => ({ name, matchTerms: [] })),
      );
      return (
        findDietaryConflicts(recipeText, allergies, intolerances).length === 0 &&
        customConflicts.length === 0 &&
        dislikeConflicts.length === 0
      );
    })
    .filter((recipe) => {
      if (selectedIngredients.length === 0) return true;
      const selected = selectedIngredients.map((value) => normalizeIngredient(value));
      return recipe.usedIngredients.some((ingredient) => {
        const normalizedIngredient = normalizeIngredient(ingredient);
        return selected.some(
          (term) => normalizedIngredient.includes(term) || term.includes(normalizedIngredient),
        );
      });
    });

  return NextResponse.json({ recipes });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envía una receta válida." },
      { status: 400 },
    );
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const record =
    typeof payload.recipe === "object" && payload.recipe !== null
      ? (payload.recipe as Record<string, unknown>)
      : payload;

  if (!isRecipeData(record)) {
    return NextResponse.json(
      { error: "La receta enviada no tiene un formato válido." },
      { status: 400 },
    );
  }

  const { supabase, user, error } = await getAuthenticatedProfile();
  if (!user) {
    return NextResponse.json(
      { error: "Inicia sesión para publicar recetas en el explorador." },
      { status: 401 },
    );
  }

  if (error) {
    return NextResponse.json(
      { error: "No se pudo comprobar tu sesión." },
      { status: 503 },
    );
  }

  const sanitizedUsedIngredients = dedupeRecipeStrings(record.usedIngredients).slice(0, 20);
  const sanitizedSteps = dedupeRecipeStrings(record.steps).slice(0, 12);

  const imageUrl = await stabilizeRecipeImage(record.imageUrl);
  const recipeRecord = {
    title: record.title.trim(),
    description: record.title.trim(),
    prep_time: record.prepTime,
    calories: record.calories,
    macros: {
      protein: record.macros.protein,
      carbs: record.macros.carbs,
      fats: record.macros.fats,
    },
    used_ingredients: sanitizedUsedIngredients,
    steps: sanitizedSteps,
    image_url: imageUrl ?? null,
    image_photographer: record.imagePhotographer ?? null,
    image_source_url: record.imageSourceUrl ?? null,
    match_percentage: record.matchPercentage,
    created_by: user.id,
  };

  const { data, error: saveError } = await supabase
    .from("recipes")
    .upsert(recipeRecord, { onConflict: "title" })
    .select()
    .single();

  if (saveError) {
    console.error("Recipe save failed:", saveError.code, saveError.message);
    return NextResponse.json(
      { error: "No se pudo guardar la receta en el explorador." },
      { status: 500 },
    );
  }

  return NextResponse.json({ recipe: recipeToApiShape(data as Record<string, unknown>) });
}
