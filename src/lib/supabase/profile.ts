import "server-only";

import type { User } from "@supabase/supabase-js";
import type { AllergyId, IntoleranceId } from "@/lib/dietary";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  allergies: AllergyId[];
  intolerances: IntoleranceId[];
}

export async function getAuthenticatedProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (
    authError &&
    authError.name !== "AuthSessionMissingError"
  ) {
    return { supabase, user: null, profile: null, error: authError };
  }

  if (!authData.user) {
    return { supabase, user: null, profile: null, error: null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, email, allergies, intolerances")
    .eq("id", authData.user.id)
    .single();

  if (error) {
    return { supabase, user: authData.user, profile: null, error };
  }

  return {
    supabase,
    user: authData.user as User,
    profile: data as UserProfile,
    error: null,
  };
}
