import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";

export async function GET() {
  try {
    const { profile, user, error } = await getAuthenticatedProfile();

    if (error) {
      console.error("Supabase profile lookup failed:", error.code);
      return NextResponse.json(
        { error: "No se pudo cargar tu cuenta. Revisa la configuración de Supabase." },
        { status: 503 },
      );
    }

    if (!user) {
      return NextResponse.json({ user: null });
    }

    if (!profile) {
      console.error("Supabase profile lookup failed:", "profile_missing");
      return NextResponse.json(
        { error: "No se pudo cargar tu perfil. Revisa la migración de Supabase." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      user: {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        allergies: profile.allergies,
        intolerances: profile.intolerances,
      },
    });
  } catch (error) {
    console.error(
      "Session configuration error:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "No se pudo conectar con Supabase." },
      { status: 503 },
    );
  }
}
