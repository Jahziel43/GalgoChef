import { NextResponse } from "next/server";
import { isRecipeData, type RecipeData } from "@/lib/recipe";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";
import { stabilizeRecipeImage } from "@/lib/supabase/recipe-images";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envía una receta válida." },
      { status: 400 },
    );
  }

  const { supabase, user, error } = await getAuthenticatedProfile();
  if (!user) {
    return NextResponse.json(
      { error: "Inicia sesión para añadir recetas a una colección." },
      { status: 401 },
    );
  }

  if (error) {
    return NextResponse.json(
      { error: "No se pudo comprobar tu sesión." },
      { status: 503 },
    );
  }

  const bodyRecord = (body ?? {}) as Record<string, unknown>;
  const recipeInput =
    typeof bodyRecord.recipe === "object" && bodyRecord.recipe !== null
      ? (bodyRecord.recipe as Record<string, unknown>)
      : typeof bodyRecord.title === "string"
        ? { title: bodyRecord.title }
        : null;

  if (!recipeInput) {
    return NextResponse.json(
      { error: "La receta enviada no es válida." },
      { status: 400 },
    );
  }

  let recipeId: string | null = null;
  if (isRecipeData(recipeInput)) {
    const recipe = recipeInput as RecipeData;
    const imageUrl = await stabilizeRecipeImage(recipe.imageUrl);
    const { data: recipeData, error: recipeError } = await supabase
      .from("recipes")
      .upsert(
        {
          title: recipe.title,
          description: recipe.title,
          prep_time: recipe.prepTime,
          calories: recipe.calories,
          macros: { protein: recipe.macros.protein, carbs: recipe.macros.carbs, fats: recipe.macros.fats },
          used_ingredients: recipe.usedIngredients,
          steps: recipe.steps,
          image_url: imageUrl ?? null,
          image_photographer: recipe.imagePhotographer ?? null,
          image_source_url: recipe.imageSourceUrl ?? null,
          match_percentage: recipe.matchPercentage,
          created_by: user.id,
        },
        { onConflict: "title" },
      )
      .select("id")
      .single();

    if (recipeError) {
      console.error("Recipe upsert for collection failed:", recipeError.code);
      return NextResponse.json(
        { error: "No se pudo guardar la receta para la colección." },
        { status: 500 },
      );
    }

    recipeId = recipeData.id;
  } else {
    const recipeLookupTitle = typeof recipeInput.title === "string" ? recipeInput.title : "";
    const { data: recipeData, error: recipeLookupError } = await supabase
      .from("recipes")
      .select("id")
      .eq("title", recipeLookupTitle)
      .single();

    if (recipeLookupError) {
      return NextResponse.json(
        { error: "No se encontró la receta para añadir a la colección." },
        { status: 404 },
      );
    }

    recipeId = recipeData.id;
  }

  const { data: collectionData, error: collectionError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", collectionId)
    .eq("user_id", user.id)
    .single();

  if (collectionError || !collectionData) {
    return NextResponse.json(
      { error: "No se pudo encontrar la colección." },
      { status: 404 },
    );
  }

  const { error: itemError } = await supabase.from("collection_items").upsert(
    { collection_id: collectionId, recipe_id: recipeId },
    { onConflict: "collection_id,recipe_id" },
  );

  if (itemError) {
    console.error("Collection item save failed:", itemError.code);
    return NextResponse.json(
      { error: "No se pudo añadir la receta a la colección." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  const { collectionId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Especifica qué receta quitar." },
      { status: 400 },
    );
  }

  const { supabase, user, error } = await getAuthenticatedProfile();
  if (!user) {
    return NextResponse.json(
      { error: "Inicia sesión para gestionar colecciones." },
      { status: 401 },
    );
  }

  if (error) {
    return NextResponse.json(
      { error: "No se pudo comprobar tu sesión." },
      { status: 503 },
    );
  }

  const title = typeof body === "object" && body !== null && "title" in body ? String((body as { title?: string }).title ?? "") : "";
  if (!title.trim()) {
    return NextResponse.json(
      { error: "Especifica el nombre de la receta." },
      { status: 400 },
    );
  }

  const { data: recipeData, error: recipeLookupError } = await supabase
    .from("recipes")
    .select("id")
    .eq("title", title)
    .maybeSingle();

  if (recipeLookupError) {
    return NextResponse.json(
      { error: "No se pudo remover la receta de la colección." },
      { status: 500 },
    );
  }

  if (!recipeData) {
    return NextResponse.json({ ok: true });
  }

  const { error: deleteError } = await supabase
    .from("collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("recipe_id", recipeData.id);

  if (deleteError) {
    console.error("Collection item delete failed:", deleteError.code);
    return NextResponse.json(
      { error: "No se pudo quitar la receta de la colección." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
