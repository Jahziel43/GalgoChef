import { NextResponse } from "next/server";
import { isRecipeData } from "@/lib/recipe";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";

export async function GET() {
  try {
    const { profile, supabase, user, error } = await getAuthenticatedProfile();

    if (!user) {
      return NextResponse.json(
        { error: "Inicia sesión para ver tus recetas guardadas." },
        { status: 401 },
      );
    }

    if (error || !profile) {
      console.error("Supabase profile lookup failed:", error?.code ?? "profile_missing");
      return NextResponse.json(
        { error: "No se pudo cargar tu perfil." },
        { status: 503 },
      );
    }

    const { data, error: queryError } = await supabase
      .from("saved_recipes")
      .select("recipe")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (queryError) {
      console.error("Saved recipes query failed:", queryError.code);
      return NextResponse.json(
        { error: "No se pudieron cargar las recetas guardadas." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      recipes: data.map((row) => row.recipe).filter(isRecipeData),
    });
  } catch (error) {
    console.error(
      "Saved recipes configuration error:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "No se pudo conectar con Supabase." },
      { status: 503 },
    );
  }
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

  if (
    typeof body !== "object" ||
    body === null ||
    !("recipe" in body) ||
    !isRecipeData(body.recipe)
  ) {
    return NextResponse.json(
      { error: "La receta enviada no tiene un formato válido." },
      { status: 400 },
    );
  }

  try {
    const { profile, supabase, user, error } = await getAuthenticatedProfile();

    if (!user) {
      return NextResponse.json(
        { error: "Inicia sesión para guardar recetas." },
        { status: 401 },
      );
    }

    if (error || !profile) {
      console.error("Supabase profile lookup failed:", error?.code ?? "profile_missing");
      return NextResponse.json(
        { error: "No se pudo cargar tu perfil." },
        { status: 503 },
      );
    }

    const { error: saveError } = await supabase.from("saved_recipes").upsert(
      {
        user_id: user.id,
        title: body.recipe.title,
        recipe: body.recipe,
      },
      { onConflict: "user_id,title" },
    );

    if (saveError) {
      console.error("Saved recipe write failed:", saveError.code);
      return NextResponse.json(
        { error: "No se pudo guardar la receta." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Saved recipe configuration error:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "No se pudo conectar con Supabase." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envía el nombre de una receta válida." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("title" in body) ||
    typeof body.title !== "string" ||
    !body.title.trim()
  ) {
    return NextResponse.json(
      { error: "Especifica qué receta quieres quitar." },
      { status: 400 },
    );
  }

  try {
    const { profile, supabase, user, error } = await getAuthenticatedProfile();

    if (!user) {
      return NextResponse.json(
        { error: "Inicia sesión para gestionar tus recetas guardadas." },
        { status: 401 },
      );
    }

    if (error || !profile) {
      console.error("Supabase profile lookup failed:", error?.code ?? "profile_missing");
      return NextResponse.json(
        { error: "No se pudo cargar tu perfil." },
        { status: 503 },
      );
    }

    const { error: deleteError } = await supabase
      .from("saved_recipes")
      .delete()
      .eq("user_id", user.id)
      .eq("title", body.title.trim());

    if (deleteError) {
      console.error("Saved recipe delete failed:", deleteError.code);
      return NextResponse.json(
        { error: "No se pudo quitar la receta guardada." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Saved recipe configuration error:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "No se pudo conectar con Supabase." },
      { status: 503 },
    );
  }
}
