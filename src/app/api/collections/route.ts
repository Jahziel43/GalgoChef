import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";

function shapeRecipe(row: Record<string, unknown>) {
  const macros =
    typeof row.macros === "object" && row.macros !== null
      ? (row.macros as Record<string, unknown>)
      : { protein: 0, carbs: 0, fats: 0 };

  return {
    id: String(row.id),
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

export async function GET() {
  const { supabase, user, error } = await getAuthenticatedProfile();
  if (!user) {
    return NextResponse.json(
      { error: "Inicia sesión para ver tus colecciones." },
      { status: 401 },
    );
  }

  if (error) {
    return NextResponse.json(
      { error: "No se pudo comprobar tu sesión." },
      { status: 503 },
    );
  }

  const { data: collections, error: collectionsError } = await supabase
    .from("collections")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (collectionsError) {
    console.error("Collections query failed:", collectionsError.code);
    return NextResponse.json(
      { error: "No se pudieron cargar tus colecciones." },
      { status: 500 },
    );
  }

  const collectionIds = (collections ?? []).map((collection) => collection.id);
  let items: Array<{
    collection_id: string;
    recipe_id: string;
    recipes: Record<string, unknown> | null;
  }> = [];

  if (collectionIds.length > 0) {
    const { data, error: itemsError } = await supabase
      .from("collection_items")
      .select("collection_id, recipe_id, recipes(*)")
      .in("collection_id", collectionIds);

    if (itemsError) {
      console.error("Collection items query failed:", itemsError.code);
      return NextResponse.json(
        { error: "No se pudieron cargar los elementos de tus colecciones." },
        { status: 500 },
      );
    }

    items = (data ?? []) as unknown as Array<{
      collection_id: string;
      recipe_id: string;
      recipes: Record<string, unknown> | null;
    }>;
  }

  const itemsByCollection = new Map<string, Array<Record<string, unknown>>>();
  for (const item of items) {
    const recipe = item.recipes;
    if (!recipe || Array.isArray(recipe)) continue;
    const list = itemsByCollection.get(item.collection_id) ?? [];
    list.push(recipe);
    itemsByCollection.set(item.collection_id, list);
  }

  return NextResponse.json({
    collections: (collections ?? []).map((collection) => ({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      createdAt: collection.created_at,
      recipes: (itemsByCollection.get(collection.id) ?? []).map((row) => shapeRecipe(row)),
    })),
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envía el nombre de una colección válida." },
      { status: 400 },
    );
  }

  const candidate = body as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "La colección necesita un nombre." },
      { status: 400 },
    );
  }

  const { supabase, user, error } = await getAuthenticatedProfile();
  if (!user) {
    return NextResponse.json(
      { error: "Inicia sesión para crear colecciones." },
      { status: 401 },
    );
  }

  if (error) {
    return NextResponse.json(
      { error: "No se pudo comprobar tu sesión." },
      { status: 503 },
    );
  }

  const { data, error: insertError } = await supabase
    .from("collections")
    .insert({
      user_id: user.id,
      name,
      description:
        typeof candidate.description === "string"
          ? candidate.description.trim()
          : "",
    })
    .select()
    .single();

  if (insertError) {
    console.error("Collection creation failed:", insertError.code, insertError.message);
    return NextResponse.json(
      { error: "No se pudo crear la colección." },
      { status: 500 },
    );
  }

  return NextResponse.json({ collection: data });
}
