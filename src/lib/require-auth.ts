import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "./require-admin";
import { validateApiKey } from "./api-key-auth";
import { createServiceClient } from "./supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

type AuthResult = {
  user_id: string;
  supabase: SupabaseClient;
};

/**
 * Unified auth: tries cookie session (requireAdmin) first,
 * falls back to API key Bearer token.
 * Pass `requiredScope` to check API key has the needed scope.
 */
export async function requireAuth(
  req: NextRequest,
  requiredScope?: string
): Promise<AuthResult | { error: NextResponse }> {
  // Try cookie auth first (dashboard users)
  const adminResult = await requireAdmin();
  if (!isAuthError(adminResult)) {
    return { user_id: adminResult.user.id, supabase: adminResult.supabase };
  }

  // Try API key auth
  const apiKeyResult = await validateApiKey(req);
  if (!apiKeyResult) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Check scope if required
  if (requiredScope && !apiKeyResult.scopes.includes(requiredScope)) {
    return { error: NextResponse.json({ error: `Missing scope: ${requiredScope}` }, { status: 403 }) };
  }

  return { user_id: apiKeyResult.user_id, supabase: createServiceClient() };
}

export function isAuthResultError(result: AuthResult | { error: NextResponse }): result is { error: NextResponse } {
  return "error" in result;
}
