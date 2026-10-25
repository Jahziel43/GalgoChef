import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envía los datos de registro en formato válido." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Completa nombre de usuario, correo y contraseña." },
      { status: 400 },
    );
  }

  const input = body as Record<string, unknown>;
  const username =
    typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) {
    return NextResponse.json(
      {
        error:
          "El usuario debe tener entre 3 y 24 caracteres: letras, números, punto, guion o guion bajo.",
      },
      { status: 400 },
    );
  }

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Escribe un correo con formato válido." },
      { status: 400 },
    );
  }

  if (password.length < 8 || password.length > 72) {
    return NextResponse.json(
      { error: "La contraseña debe tener entre 8 y 72 caracteres." },
      { status: 400 },
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: existingProfile, error: lookupError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (lookupError) {
      console.error("Supabase username lookup failed:", lookupError.code);
      return NextResponse.json(
        { error: "No se pudo verificar el usuario. Revisa que la migración esté aplicada." },
        { status: 503 },
      );
    }

    if (existingProfile) {
      return NextResponse.json(
        { error: "Ese nombre de usuario ya está ocupado." },
        { status: 409 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    });

    if (error) {
      return NextResponse.json(
        { error: "No se pudo crear la cuenta. Revisa el correo o prueba otro." },
        { status: 400 },
      );
    }

    if (!data.session) {
      return NextResponse.json(
        {
          error:
            "Supabase aún solicita confirmar el correo. Desactiva la confirmación de email en Authentication → Providers → Email.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Account registration configuration error:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "Falta configurar Supabase para registrar cuentas." },
      { status: 503 },
    );
  }
}
