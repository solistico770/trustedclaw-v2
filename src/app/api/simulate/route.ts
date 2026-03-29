import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const body = await req.json();
  const { gate_type, sender_name, channel_name, message_content } = body;
  if (!message_content) return NextResponse.json({ error: "message_content required" }, { status: 400 });

  const res = await fetch(new URL("/api/messages/ingest", req.url).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gate_type: gate_type || "simulator",
      sender_name: sender_name || "Simulator",
      channel_name: channel_name || "Simulator",
      content: message_content,
      user_id: userId,
    }),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
