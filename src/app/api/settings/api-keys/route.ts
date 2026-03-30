import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";
import { randomBytes } from "crypto";
import { hashApiKey } from "@/lib/api-key-auth";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const db = createServiceClient();
  const { data, error } = await db
    .from("api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, created_at, revoked_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const body = await req.json();
  const { name } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Generate random key: tc_live_<32 random hex chars>
  const rawKey = `tc_live_${randomBytes(32).toString("hex")}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 16);

  const db = createServiceClient();
  const { data, error } = await db
    .from("api_keys")
    .insert({
      user_id: auth.user.id,
      name: name.trim(),
      key_hash: keyHash,
      key_prefix: keyPrefix,
      scopes: ["ingest", "gates"],
    })
    .select("id, name, key_prefix, scopes, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the raw key ONCE — it's never stored in plaintext
  return NextResponse.json({ ...data, raw_key: rawKey });
}
