import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";

export async function DELETE() {
  try {
    const { supabase, user, error: authError } = await getAuthenticatedProfile();
    if (authError) {
      console.error("Account deletion authentication failed:", authError.code);
      return NextResponse.json(
        { error: "No se pudo verificar tu sesión." },
        { status: 503 },
      );
    }
    if (!user) {
      return NextResponse.json(
        { error: "Inicia sesión para eliminar tu cuenta." },
        { status: 401 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { error: recipeDeleteError } = await admin
      .from("recipes")
      .delete()
      .eq("created_by", user.id);
    if (recipeDeleteError) {
      console.error("User recipes deletion failed:", recipeDeleteError.code);
      return NextResponse.json(
        { error: "No se pudieron eliminar las recetas de tu cuenta." },
        { status: 500 },
      );
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.warn("Session cleanup before account deletion failed:", signOutError.code);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Supabase account deletion failed:", deleteError.message);
      return NextResponse.json(
        { error: "No se pudo eliminar la cuenta. Inténtalo de nuevo." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Account deletion failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "No se pudo eliminar la cuenta." },
      { status: 500 },
    );
  }
}
