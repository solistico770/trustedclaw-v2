import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { createServiceClient } from "./supabase-server";

type ApiKeyResult = {
  user_id: string;
  scopes: string[];
};

const HMAC_SECRET = process.env.API_KEY_HMAC_SECRET || "trustedclaw-api-key-secret";

export function hashApiKey(rawKey: string): string {
  return createHmac("sha256", HMAC_SECRET).update(rawKey).digest("hex");
}

/**
 * Validate a Bearer API key from the request.
 * Returns { user_id, scopes } on success, null on failure.
 */
export async function validateApiKey(req: NextRequest): Promise<ApiKeyResult | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey || rawKey.length < 10) return null;

  const keyHash = hashApiKey(rawKey);
  const db = createServiceClient();

  const { data: keyRecord } = await db
    .from("api_keys")
    .select("id, user_id, scopes, revoked_at")
    .eq("key_hash", keyHash)
    .single();

  if (!keyRecord) return null;
  if (keyRecord.revoked_at) return null;

  // Update last_used_at (fire-and-forget)
  db.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id)
    .then(() => {});

  return {
    user_id: keyRecord.user_id,
    scopes: keyRecord.scopes || ["ingest", "gates"],
  };
}
