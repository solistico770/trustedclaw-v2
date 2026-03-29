import { NextResponse } from "next/server";
import { createServerClient } from "./supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

type AuthSuccess = {
  user: { id: string; email?: string };
  profile: { role: string };
  supabase: SupabaseClient;
};

type AuthError = {
  error: NextResponse;
};

export async function requireAdmin(): Promise<AuthSuccess | AuthError> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, profile, supabase };
}

export function isAuthError(result: AuthSuccess | AuthError): result is AuthError {
  return "error" in result;
}
