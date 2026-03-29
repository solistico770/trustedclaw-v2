import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { gate_type, sender_name, channel_name, message_content, user_id } = body;
  if (!message_content || !user_id) return NextResponse.json({ error: "message_content and user_id required" }, { status: 400 });

  const res = await fetch(new URL("/api/messages/ingest", req.url).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gate_type: gate_type || "simulator",
      sender_name: sender_name || "Simulator",
      channel_name: channel_name || "Simulator",
      content: message_content,
      user_id,
    }),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
