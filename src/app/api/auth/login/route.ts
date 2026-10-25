import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envía usuario y contraseña en formato válido." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Escribe tu usuario o correo y contraseña." },
      { status: 400 },
    );
  }

  const input = body as Record<string, unknown>;
  const identifier =
    typeof input.identifier === "string"
      ? input.identifier.trim().toLowerCase()
      : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (
    !identifier ||
    identifier.length > 254 ||
    password.length < 1 ||
    password.length > 72 ||
    (!identifier.includes("@") && !/^[a-z0-9_.-]{3,24}$/.test(identifier))
  ) {
    return NextResponse.json(
      { error: "Escribe tu usuario o correo y contraseña." },
      { status: 400 },
    );
  }

  try {
    let email = identifier;
    if (!identifier.includes("@")) {
      const admin = createSupabaseAdminClient();
      const { data: profile, error } = await admin
        .from("profiles")
        .select("email")
        .eq("username", identifier)
        .maybeSingle();

      if (error || !profile) {
        return NextResponse.json(
          { error: "Usuario/correo o contraseña incorrectos." },
          { status: 401 },
        );
      }
      email = profile.email;
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { error: "Usuario/correo o contraseña incorrectos." },
        { status: 401 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Account login configuration error:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "Falta configurar Supabase para iniciar sesión." },
      { status: 503 },
    );
  }
}
