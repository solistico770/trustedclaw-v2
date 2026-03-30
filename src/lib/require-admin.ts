import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "./supabase-server";
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
  // Cookie-based client to verify the user's session
  const authClient = await createServerClient();
  const { data: { user }, error } = await authClient.auth.getUser();

  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Service client for all DB queries (bypasses RLS issues in API route context)
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  // Return service client — all API queries use it with user.id for scoping
  return { user, profile, supabase };
}

export function isAuthError(result: AuthSuccess | AuthError): result is AuthError {
  return "error" in result;
}
