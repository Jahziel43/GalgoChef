import { NextResponse } from "next/server";
import { findDietaryConflicts } from "@/lib/dietary";
import { isRecipeData, type RecipeData } from "@/lib/recipe";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";

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
    .select("*")
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

  const recipes = (data ?? [])
    .map((row) => recipeToApiShape(row as Record<string, unknown>))
    .filter(isRecipeData)
    .filter((recipe) => {
      const recipeText = [recipe.title, ...recipe.usedIngredients, ...recipe.steps].join(" ");
      return findDietaryConflicts(recipeText, allergies, intolerances).length === 0;
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
    used_ingredients: record.usedIngredients,
    steps: record.steps,
    image_url: record.imageUrl ?? null,
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
