import { NextResponse } from "next/server";
import {
  allergyOptions,
  intoleranceOptions,
  isAllergyId,
  isIntoleranceId,
} from "@/lib/dietary";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";

export async function PATCH(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envía preferencias válidas." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("allergies" in body) ||
    !("intolerances" in body) ||
    !Array.isArray(body.allergies) ||
    !Array.isArray(body.intolerances) ||
    body.allergies.length > allergyOptions.length ||
    body.intolerances.length > intoleranceOptions.length ||
    body.allergies.some((item) => !isAllergyId(item)) ||
    body.intolerances.some((item) => !isIntoleranceId(item))
  ) {
    return NextResponse.json(
      { error: "Selecciona opciones válidas de alergias e intolerancias." },
      { status: 400 },
    );
  }

  try {
    const { profile, supabase, user, error } = await getAuthenticatedProfile();

    if (!user) {
      return NextResponse.json(
        { error: "Inicia sesión para guardar tus restricciones alimentarias." },
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

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({
        allergies: [...new Set(body.allergies)],
        intolerances: [...new Set(body.intolerances)],
      })
      .eq("id", user.id)
      .select("id, username, email, allergies, intolerances")
      .single();

    if (updateError) {
      console.error("Supabase profile update failed:", updateError.code);
      return NextResponse.json(
        { error: "No se pudieron guardar tus preferencias." },
        { status: 500 },
      );
    }

    return NextResponse.json({ user: data });
  } catch (error) {
    console.error(
      "Profile update configuration error:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "No se pudo conectar con Supabase." },
      { status: 503 },
    );
  }
}
