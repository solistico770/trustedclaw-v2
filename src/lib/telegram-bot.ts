import { createServiceClient } from "@/lib/supabase-server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupabaseClient } from "@supabase/supabase-js";

const TG_API = "https://api.telegram.org/bot";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// ─── Telegram types ─────────────────────────────────────────────────────────

type TgUser = { id: number; first_name: string; last_name?: string; username?: string };
type TgChat = { id: number; type: string; title?: string; username?: string };
type TgVoice = { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
type TgMessage = { message_id: number; from?: TgUser; chat: TgChat; text?: string; voice?: TgVoice; caption?: string; date: number };
type TgCallbackQuery = { id: string; from: TgUser; message?: TgMessage; data?: string };
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallbackQuery };

// ─── Send helpers ───────────────────────────────────────────────────────────

async function sendMessage(token: string, chatId: number, text: string, replyMarkup?: unknown) {
  // Telegram limits messages to 4096 chars
  const chunks = splitMessage(text, 4000);
  for (const chunk of chunks) {
    const body: Record<string, unknown> = { chat_id: chatId, text: chunk, parse_mode: "HTML" };
    if (replyMarkup && chunk === chunks[chunks.length - 1]) body.reply_markup = replyMarkup;
    await fetch(`${TG_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

function splitMessage(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= max) { parts.push(remaining); break; }
    let cut = remaining.lastIndexOf("\n", max);
    if (cut < max / 2) cut = max;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  return parts;
}

async function sendTyping(token: string, chatId: number) {
  await fetch(`${TG_API}${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

async function sendPhoto(token: string, chatId: number, photoBuffer: Buffer, caption?: string) {
  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  formData.append("photo", new Blob([new Uint8Array(photoBuffer)], { type: "image/png" }), "image.png");
  if (caption) formData.append("caption", caption);
  await fetch(`${TG_API}${token}/sendPhoto`, { method: "POST", body: formData });
}

async function sendVideo(token: string, chatId: number, videoBuffer: Buffer, caption?: string) {
  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  formData.append("video", new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" }), "video.mp4");
  if (caption) formData.append("caption", caption);
  await fetch(`${TG_API}${token}/sendVideo`, { method: "POST", body: formData });
}

async function sendVoiceReply(token: string, chatId: number, text: string) {
  const apiKey = process.env.GEMINI_API_KEY || "";

  // Try multiple TTS model options
  const ttsModels = [
    "gemini-2.5-flash-preview-tts",
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
  ];

  let audioBuffer: Buffer | null = null;

  for (const model of ttsModels) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
          },
        }),
      });

      if (!res.ok) continue;

      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audioPart = data.candidates?.[0]?.content?.parts?.find((p: any) =>
        p.inlineData?.mimeType?.startsWith("audio/")
      );

      if (audioPart?.inlineData?.data) {
        audioBuffer = Buffer.from(audioPart.inlineData.data, "base64");
        break;
      }
    } catch {
      continue;
    }
  }

  if (audioBuffer) {
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("voice", new Blob([new Uint8Array(audioBuffer)], { type: "audio/ogg" }), "voice.ogg");
    await fetch(`${TG_API}${token}/sendVoice`, { method: "POST", body: formData });
  } else {
    // Fallback: send as text
    await sendMessage(token, chatId, text);
  }
}

async function sendUploadAction(token: string, chatId: number, type: "upload_photo" | "upload_video") {
  await fetch(`${TG_API}${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: type }),
  });
}

async function answerCallback(token: string, callbackId: string, text?: string) {
  await fetch(`${TG_API}${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

// ─── Voice transcription ────────────────────────────────────────────────────

async function transcribeVoice(token: string, fileId: string): Promise<string> {
  // 1. Get file path from Telegram
  const fileRes = await fetch(`${TG_API}${token}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  if (!fileData.ok || !fileData.result?.file_path) {
    throw new Error("Failed to get voice file path");
  }

  // 2. Download the audio file
  const audioUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
  const audioRes = await fetch(audioUrl);
  const audioBuffer = await audioRes.arrayBuffer();
  const base64Audio = Buffer.from(audioBuffer).toString("base64");

  // 3. Transcribe with Gemini (supports audio natively)
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: "audio/ogg",
        data: base64Audio,
      },
    },
    { text: "Transcribe this voice message exactly as spoken. Output ONLY the transcription, nothing else. If it's in Hebrew, keep it in Hebrew. If mixed languages, keep them as-is." },
  ]);

  return result.response.text().trim();
}

// ─── Image generation (Nano Banana / gemini-2.5-flash-image) ────────────────

async function generateImage(prompt: string): Promise<Buffer> {
  // Nano Banana = gemini-2.5-flash-image — native image generation
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] } as any,
  });

  const result = await model.generateContent(`Generate an image: ${prompt}`);
  const parts = result.response.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inlineData = (part as any).inlineData;
    if (inlineData?.mimeType?.startsWith("image/") && inlineData?.data) {
      return Buffer.from(inlineData.data, "base64");
    }
  }

  throw new Error("Nano Banana returned no image");
}

// ─── Video generation (Veo 2.0) ─────────────────────────────────────────────

async function generateVideo(prompt: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY || "";

  // Veo uses generateVideos endpoint (async)
  const startRes = await fetch(`${GEMINI_API_BASE}/models/veo-2.0-generate-001:generateVideos?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        numberOfVideos: 1,
        durationSeconds: 5,
        aspectRatio: "16:9",
      },
    }),
  });

  const startData = await startRes.json();

  if (startData.error) {
    throw new Error(startData.error.message || "Veo API error");
  }

  // Async operation — poll for completion
  const opName = startData.name;
  if (!opName) {
    // Maybe it returned inline (short videos)
    const video = startData.generatedVideos?.[0]?.video;
    if (video?.bytesBase64Encoded) {
      return Buffer.from(video.bytesBase64Encoded, "base64");
    }
    throw new Error("No operation name returned from Veo");
  }

  const maxWait = 120_000;
  const pollInterval = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));

    const pollRes = await fetch(`${GEMINI_API_BASE}/operations/${opName}?key=${apiKey}`);
    const pollData = await pollRes.json();

    if (pollData.done) {
      const video = pollData.response?.generatedVideos?.[0]?.video;

      if (video?.uri) {
        const sep = video.uri.includes("?") ? "&" : "?";
        const videoRes = await fetch(`${video.uri}${sep}key=${apiKey}`);
        return Buffer.from(await videoRes.arrayBuffer());
      }

      if (video?.bytesBase64Encoded) {
        return Buffer.from(video.bytesBase64Encoded, "base64");
      }

      throw new Error("Video generated but no data returned");
    }

    if (pollData.error) {
      throw new Error(pollData.error.message || "Video generation failed");
    }
  }

  throw new Error("Video generation timed out (2 min)");
}

// ─── System context builder ─────────────────────────────────────────────────

async function buildSystemContext(db: SupabaseClient, userId: string): Promise<string> {
  // Fetch everything the agent needs to know
  const [
    { data: cases },
    { data: entities },
    { data: tasks },
    { data: settings },
    { data: skills },
    { count: pendingSignals },
  ] = await Promise.all([
    db.from("cases")
      .select("id, case_number, title, summary, status, urgency, importance, message_count, created_at")
      .eq("user_id", userId)
      .not("status", "in", '("closed","merged")')
      .order("urgency", { ascending: true })
      .order("importance", { ascending: true })
      .limit(30),
    db.from("entities")
      .select("id, canonical_name, type, status, phone, email, telegram_handle, wa_jid")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("canonical_name")
      .limit(50),
    db.from("tasks")
      .select("id, title, status, due_at, scheduled_at, case_id")
      .eq("user_id", userId)
      .neq("status", "closed")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(20),
    db.from("user_settings")
      .select("context_prompt, identity")
      .eq("user_id", userId)
      .single(),
    db.from("skills")
      .select("name, summary, instructions")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("auto_attach", true),
    db.from("signals")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending"),
  ]);

  const identity = (settings?.identity || {}) as Record<string, string>;
  const contextPrompt = settings?.context_prompt || "";

  const casesText = (cases || []).map(c =>
    `#${c.case_number} [${c.status}] U${c.urgency}/I${c.importance} "${c.title}" — ${c.summary || "no summary"} (${c.message_count} signals)`
  ).join("\n");

  const entitiesText = (entities || []).map(e => {
    const contacts = [e.phone, e.email, e.telegram_handle].filter(Boolean).join(", ");
    return `${e.canonical_name} (${e.type})${contacts ? ` — ${contacts}` : ""}`;
  }).join("\n");

  const tasksText = (tasks || []).map(t => {
    const due = t.due_at ? ` due ${t.due_at}` : "";
    return `[${t.id.slice(0, 8)}] "${t.title}" (${t.status})${due}`;
  }).join("\n");

  const skillsText = (skills || []).map(s =>
    `--- SKILL: ${s.name} ---\n${s.instructions}`
  ).join("\n\n");

  return `${contextPrompt}

${identity.name ? `Owner: ${identity.name}` : ""}${identity.role ? ` (${identity.role})` : ""}${identity.business ? ` at ${identity.business}` : ""}

${skillsText ? `\n--- ACTIVE SKILLS ---\n${skillsText}\n` : ""}
--- CURRENT SYSTEM STATE ---
Open Cases (${cases?.length || 0}):
${casesText || "None"}

Active Entities (${entities?.length || 0}):
${entitiesText || "None"}

Open Tasks (${tasks?.length || 0}):
${tasksText || "None"}

Pending Signals: ${pendingSignals || 0}
Current time: ${new Date().toISOString()}`;
}

// ─── Conversation history ───────────────────────────────────────────────────

async function getConversationHistory(db: SupabaseClient, userId: string, chatId: number, limit = 20): Promise<Array<{ role: string; content: string }>> {
  const { data } = await db.from("telegram_messages")
    .select("role, content")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data || []).reverse();
}

async function saveMessage(db: SupabaseClient, userId: string, chatId: number, role: "user" | "assistant", content: string) {
  await db.from("telegram_messages").insert({
    user_id: userId,
    chat_id: chatId,
    role,
    content,
  });
}

// ─── Command execution ──────────────────────────────────────────────────────

type BotCommand =
  | { type: "create_case"; title: string; summary?: string; urgency?: number; importance?: number }
  | { type: "close_case"; case_number: number }
  | { type: "update_case"; case_number: number; status?: string; urgency?: number; importance?: number; summary?: string; title?: string }
  | { type: "merge_cases"; from_number: number; into_number: number; reason: string }
  | { type: "list_cases"; status?: string; search?: string; limit?: number }
  | { type: "get_case"; case_number: number }
  | { type: "create_entity"; name: string; entity_type: string; phone?: string; email?: string; telegram_handle?: string }
  | { type: "update_entity"; entity_id?: string; name?: string; canonical_name?: string; entity_type?: string; phone?: string; email?: string; telegram_handle?: string; whatsapp_number?: string; website?: string; external_id?: string }
  | { type: "approve_entity"; entity_id?: string; name?: string }
  | { type: "reject_entity"; entity_id?: string; name?: string }
  | { type: "merge_entities"; source_name: string; target_name: string; reason?: string }
  | { type: "list_entities"; entity_type?: string; status?: string; search?: string; limit?: number }
  | { type: "get_entity"; entity_id?: string; name?: string }
  | { type: "link_entity"; entity_name: string; case_number: number; role?: string }
  | { type: "unlink_entity"; entity_name: string; case_number: number }
  | { type: "create_task"; title: string; case_number?: number; due_at?: string; scheduled_at?: string; description?: string }
  | { type: "close_task"; task_id: string }
  | { type: "update_task"; task_id: string; title?: string; description?: string; due_at?: string; scheduled_at?: string }
  | { type: "reopen_task"; task_id: string }
  | { type: "list_tasks"; status?: string; case_number?: number; search?: string; limit?: number }
  | { type: "list_signals"; case_number?: number; entity_name?: string; status?: string; limit?: number }
  | { type: "scan_case"; case_number: number }
  | { type: "trigger_scan" }
  | { type: "web_search"; query: string }
  | { type: "generate_image"; prompt: string }
  | { type: "generate_video"; prompt: string }
  | { type: "reply_voice"; text: string };

async function executeCommands(db: SupabaseClient, userId: string, commands: BotCommand[], tgToken?: string, chatId?: number): Promise<string[]> {
  const results: string[] = [];

  for (const cmd of commands) {
    try {
      switch (cmd.type) {
        case "create_case": {
          const { data } = await db.from("cases").insert({
            user_id: userId,
            title: cmd.title,
            summary: cmd.summary || null,
            status: "open",
            urgency: cmd.urgency || 3,
            importance: cmd.importance || 3,
          }).select("case_number").single();
          if (data) results.push(`Created case #${data.case_number}`);
          break;
        }
        case "close_case": {
          const { data: c } = await db.from("cases")
            .select("id").eq("user_id", userId).eq("case_number", cmd.case_number).single();
          if (c) {
            await db.from("cases").update({ status: "closed" }).eq("id", c.id);
            results.push(`Closed case #${cmd.case_number}`);
          }
          break;
        }
        case "update_case": {
          const { data: c } = await db.from("cases")
            .select("id").eq("user_id", userId).eq("case_number", cmd.case_number).single();
          if (c) {
            const updates: Record<string, unknown> = {};
            if (cmd.status) updates.status = cmd.status;
            if (cmd.urgency) updates.urgency = cmd.urgency;
            if (cmd.importance) updates.importance = cmd.importance;
            if (cmd.summary) updates.summary = cmd.summary;
            if (cmd.title) updates.title = cmd.title;
            await db.from("cases").update(updates).eq("id", c.id);
            results.push(`Updated case #${cmd.case_number}`);
          } else {
            results.push(`Case #${cmd.case_number} not found`);
          }
          break;
        }
        case "merge_cases": {
          const [{ data: from }, { data: into }] = await Promise.all([
            db.from("cases").select("id").eq("user_id", userId).eq("case_number", cmd.from_number).single(),
            db.from("cases").select("id").eq("user_id", userId).eq("case_number", cmd.into_number).single(),
          ]);
          if (from && into) {
            await db.from("signals").update({ case_id: into.id }).eq("case_id", from.id);
            await db.from("cases").update({ status: "merged" }).eq("id", from.id);
            results.push(`Merged #${cmd.from_number} into #${cmd.into_number}`);
          }
          break;
        }
        case "create_entity": {
          const { data } = await db.from("entities").insert({
            user_id: userId,
            canonical_name: cmd.name,
            type: cmd.entity_type,
            status: "active",
            phone: cmd.phone || null,
            email: cmd.email || null,
            telegram_handle: cmd.telegram_handle || null,
          }).select("id").single();
          if (data) results.push(`Created entity "${cmd.name}"`);
          break;
        }
        case "create_task": {
          let caseId = null;
          if (cmd.case_number) {
            const { data: c } = await db.from("cases")
              .select("id").eq("user_id", userId).eq("case_number", cmd.case_number).single();
            caseId = c?.id || null;
          }
          const { data: newTask } = await db.from("tasks").insert({
            user_id: userId,
            case_id: caseId,
            title: cmd.title,
            description: cmd.description || null,
            status: "open",
            due_at: cmd.due_at || null,
            scheduled_at: cmd.scheduled_at || null,
          }).select("id").single();
          results.push(`Created task "${cmd.title}"${newTask ? ` [${newTask.id.slice(0, 8)}]` : ""}`);
          break;
        }
        case "close_task": {
          await db.from("tasks").update({ status: "closed", closed_at: new Date().toISOString() })
            .eq("id", cmd.task_id).eq("user_id", userId);
          results.push(`Closed task`);
          break;
        }
        case "update_task": {
          const updates: Record<string, unknown> = {};
          if (cmd.title) updates.title = cmd.title;
          if (cmd.description !== undefined) updates.description = cmd.description;
          if (cmd.due_at) updates.due_at = cmd.due_at;
          if (cmd.scheduled_at) updates.scheduled_at = cmd.scheduled_at;
          const { error } = await db.from("tasks").update(updates).eq("id", cmd.task_id).eq("user_id", userId);
          results.push(error ? `Failed to update task: ${error.message}` : `Updated task ${cmd.task_id.slice(0, 8)}`);
          break;
        }
        case "reopen_task": {
          await db.from("tasks").update({ status: "open", closed_at: null }).eq("id", cmd.task_id).eq("user_id", userId);
          results.push(`Reopened task ${cmd.task_id.slice(0, 8)}`);
          break;
        }
        case "list_tasks": {
          let q = db.from("tasks")
            .select("id, title, status, due_at, scheduled_at, case_id, created_at")
            .eq("user_id", userId);
          if (cmd.status) q = q.eq("status", cmd.status);
          if (cmd.case_number) {
            const { data: c } = await db.from("cases").select("id").eq("user_id", userId).eq("case_number", cmd.case_number).single();
            if (c) q = q.eq("case_id", c.id);
          }
          if (cmd.search) q = q.ilike("title", `%${cmd.search}%`);
          q = q.order("created_at", { ascending: false }).limit(cmd.limit || 20);
          const { data: taskList } = await q;
          if (!taskList?.length) { results.push("No tasks found"); break; }
          const lines = taskList.map(t => {
            const due = t.due_at ? ` due:${t.due_at.slice(0, 10)}` : "";
            const sched = t.scheduled_at ? ` sched:${t.scheduled_at.slice(0, 10)}` : "";
            return `[${t.id.slice(0, 8)}] "${t.title}" (${t.status})${due}${sched}`;
          });
          results.push(`Tasks (${taskList.length}):\n${lines.join("\n")}`);
          break;
        }
        case "list_cases": {
          let q = db.from("cases")
            .select("case_number, title, status, urgency, importance, message_count, summary, created_at, updated_at")
            .eq("user_id", userId);
          if (cmd.status) {
            if (cmd.status === "active") {
              q = q.not("status", "in", '("closed","merged")');
            } else {
              q = q.eq("status", cmd.status);
            }
          }
          if (cmd.search) q = q.or(`title.ilike.%${cmd.search}%,summary.ilike.%${cmd.search}%`);
          q = q.order("urgency", { ascending: true }).order("importance", { ascending: true }).limit(cmd.limit || 25);
          const { data: caseList } = await q;
          if (!caseList?.length) { results.push("No cases found"); break; }
          const lines = caseList.map(c =>
            `#${c.case_number} [${c.status}] U${c.urgency}/I${c.importance} "${c.title}" (${c.message_count} signals)`
          );
          results.push(`Cases (${caseList.length}):\n${lines.join("\n")}`);
          break;
        }
        case "get_case": {
          const { data: c } = await db.from("cases")
            .select("*")
            .eq("user_id", userId).eq("case_number", cmd.case_number).single();
          if (!c) { results.push(`Case #${cmd.case_number} not found`); break; }
          // Get linked entities, recent signals, tasks
          const [{ data: caseEntities }, { data: signals }, { data: caseTasks }, { data: events }] = await Promise.all([
            db.from("case_entities")
              .select("role, entities(id, canonical_name, type, status, phone, email, telegram_handle)")
              .eq("case_id", c.id),
            db.from("signals")
              .select("id, sender_identifier, channel_identifier, status, occurred_at, raw_payload")
              .eq("case_id", c.id)
              .order("occurred_at", { ascending: false })
              .limit(15),
            db.from("tasks")
              .select("id, title, status, due_at")
              .eq("case_id", c.id)
              .eq("user_id", userId),
            db.from("case_events")
              .select("event_type, empowerment_line, created_at")
              .eq("case_id", c.id)
              .order("created_at", { ascending: false })
              .limit(5),
          ]);

          let detail = `Case #${c.case_number}: "${c.title}"\nStatus: ${c.status} | Urgency: ${c.urgency} | Importance: ${c.importance}\nSummary: ${c.summary || "none"}\nCreated: ${c.created_at} | Signals: ${c.message_count}`;

          if (caseEntities?.length) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const entLines = caseEntities.map((ce: any) => {
              const e = ce.entities;
              return `  ${e.canonical_name} (${e.type}, ${ce.role})${e.phone ? ` ${e.phone}` : ""}`;
            });
            detail += `\n\nEntities (${caseEntities.length}):\n${entLines.join("\n")}`;
          }

          if (caseTasks?.length) {
            const taskLines = caseTasks.map(t => `  [${t.id.slice(0, 8)}] "${t.title}" (${t.status})${t.due_at ? ` due:${t.due_at.slice(0, 10)}` : ""}`);
            detail += `\n\nTasks (${caseTasks.length}):\n${taskLines.join("\n")}`;
          }

          if (signals?.length) {
            const sigLines = signals.map(s => {
              const payload = s.raw_payload as Record<string, unknown> || {};
              const content = (payload.content as string || "").slice(0, 100);
              return `  [${s.occurred_at?.slice(0, 16)}] ${s.sender_identifier || "unknown"}: ${content}`;
            });
            detail += `\n\nRecent Signals (${signals.length}):\n${sigLines.join("\n")}`;
          }

          if (events?.length) {
            const evLines = events.map(e => `  ${e.created_at?.slice(0, 16)} ${e.event_type}: ${e.empowerment_line || "—"}`);
            detail += `\n\nRecent Events:\n${evLines.join("\n")}`;
          }

          results.push(detail);
          break;
        }
        case "list_entities": {
          let q = db.from("entities")
            .select("id, canonical_name, type, status, phone, email, telegram_handle, wa_jid, created_at")
            .eq("user_id", userId);
          if (cmd.entity_type) q = q.eq("type", cmd.entity_type);
          if (cmd.status) q = q.eq("status", cmd.status);
          if (cmd.search) q = q.or(`canonical_name.ilike.%${cmd.search}%,phone.ilike.%${cmd.search}%,email.ilike.%${cmd.search}%`);
          q = q.order("canonical_name").limit(cmd.limit || 30);
          const { data: entList } = await q;
          if (!entList?.length) { results.push("No entities found"); break; }
          const lines = entList.map(e => {
            const contacts = [e.phone, e.email, e.telegram_handle].filter(Boolean).join(", ");
            return `[${e.id.slice(0, 8)}] ${e.canonical_name} (${e.type}, ${e.status})${contacts ? ` — ${contacts}` : ""}`;
          });
          results.push(`Entities (${entList.length}):\n${lines.join("\n")}`);
          break;
        }
        case "get_entity": {
          let entityQ = db.from("entities").select("*").eq("user_id", userId);
          if (cmd.entity_id) entityQ = entityQ.eq("id", cmd.entity_id);
          else if (cmd.name) entityQ = entityQ.ilike("canonical_name", `%${cmd.name}%`);
          const { data: ent } = await entityQ.limit(1).single();
          if (!ent) { results.push(`Entity not found`); break; }

          // Get connected cases and recent signals
          const [{ data: linkedCases }, { data: sigEntities }] = await Promise.all([
            db.from("case_entities")
              .select("role, cases(case_number, title, status)")
              .eq("entity_id", ent.id),
            db.from("signal_entities")
              .select("resolution_method, signals(id, occurred_at, raw_payload, case_id)")
              .eq("entity_id", ent.id)
              .order("created_at", { ascending: false })
              .limit(10),
          ]);

          const contacts = [
            ent.phone && `Phone: ${ent.phone}`,
            ent.email && `Email: ${ent.email}`,
            ent.telegram_handle && `TG: ${ent.telegram_handle}`,
            ent.wa_jid && `WA: ${ent.wa_jid}`,
            ent.website && `Web: ${ent.website}`,
            ent.external_id && `ExtID: ${ent.external_id}`,
          ].filter(Boolean).join(" | ");

          let detail = `Entity: ${ent.canonical_name} (${ent.type})\nStatus: ${ent.status} | ID: ${ent.id.slice(0, 8)}\n${contacts || "No contact info"}`;
          if (ent.aliases?.length) detail += `\nAliases: ${ent.aliases.join(", ")}`;

          if (linkedCases?.length) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const caseLines = linkedCases.map((lc: any) => `  #${lc.cases.case_number} "${lc.cases.title}" [${lc.cases.status}] (${lc.role})`);
            detail += `\n\nLinked Cases (${linkedCases.length}):\n${caseLines.join("\n")}`;
          }

          if (sigEntities?.length) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sigLines = sigEntities.map((se: any) => {
              const sig = se.signals;
              const content = ((sig.raw_payload as Record<string, unknown>)?.content as string || "").slice(0, 80);
              return `  [${sig.occurred_at?.slice(0, 16)}] ${content}`;
            });
            detail += `\n\nRecent Signals (${sigEntities.length}):\n${sigLines.join("\n")}`;
          }

          results.push(detail);
          break;
        }
        case "update_entity": {
          let entQ = db.from("entities").select("id").eq("user_id", userId);
          if (cmd.entity_id) entQ = entQ.eq("id", cmd.entity_id);
          else if (cmd.name) entQ = entQ.ilike("canonical_name", `%${cmd.name}%`);
          const { data: ent } = await entQ.limit(1).single();
          if (!ent) { results.push("Entity not found"); break; }
          const updates: Record<string, unknown> = {};
          if (cmd.canonical_name) updates.canonical_name = cmd.canonical_name;
          if (cmd.entity_type) updates.type = cmd.entity_type;
          if (cmd.phone !== undefined) updates.phone = cmd.phone || null;
          if (cmd.email !== undefined) updates.email = cmd.email || null;
          if (cmd.telegram_handle !== undefined) updates.telegram_handle = cmd.telegram_handle || null;
          if (cmd.whatsapp_number !== undefined) updates.whatsapp_number = cmd.whatsapp_number || null;
          if (cmd.website !== undefined) updates.website = cmd.website || null;
          if (cmd.external_id !== undefined) updates.external_id = cmd.external_id || null;
          const { error } = await db.from("entities").update(updates).eq("id", ent.id);
          results.push(error ? `Failed: ${error.message}` : `Updated entity ${cmd.name || cmd.entity_id?.slice(0, 8)}`);
          break;
        }
        case "approve_entity": {
          let entQ = db.from("entities").select("id, canonical_name").eq("user_id", userId);
          if (cmd.entity_id) entQ = entQ.eq("id", cmd.entity_id);
          else if (cmd.name) entQ = entQ.ilike("canonical_name", `%${cmd.name}%`);
          const { data: ent } = await entQ.limit(1).single();
          if (!ent) { results.push("Entity not found"); break; }
          await db.from("entities").update({ status: "active", approved_at: new Date().toISOString() }).eq("id", ent.id);
          results.push(`Approved entity "${ent.canonical_name}"`);
          break;
        }
        case "reject_entity": {
          let entQ = db.from("entities").select("id, canonical_name").eq("user_id", userId);
          if (cmd.entity_id) entQ = entQ.eq("id", cmd.entity_id);
          else if (cmd.name) entQ = entQ.ilike("canonical_name", `%${cmd.name}%`);
          const { data: ent } = await entQ.limit(1).single();
          if (!ent) { results.push("Entity not found"); break; }
          await db.from("entities").update({ status: "rejected" }).eq("id", ent.id);
          results.push(`Rejected entity "${ent.canonical_name}"`);
          break;
        }
        case "merge_entities": {
          const [{ data: source }, { data: target }] = await Promise.all([
            db.from("entities").select("id, canonical_name").eq("user_id", userId).ilike("canonical_name", `%${cmd.source_name}%`).limit(1).single(),
            db.from("entities").select("id, canonical_name").eq("user_id", userId).ilike("canonical_name", `%${cmd.target_name}%`).limit(1).single(),
          ]);
          if (!source || !target) { results.push(`Could not find both entities (source: ${cmd.source_name}, target: ${cmd.target_name})`); break; }
          // Move case_entities links
          const { data: sourceCases } = await db.from("case_entities").select("case_id, role").eq("entity_id", source.id);
          for (const sc of sourceCases || []) {
            // Upsert — avoid duplicate PK
            await db.from("case_entities").upsert({ case_id: sc.case_id, entity_id: target.id, role: sc.role }, { onConflict: "case_id,entity_id" });
          }
          // Move signal_entities links
          const { data: sourceSigs } = await db.from("signal_entities").select("signal_id, resolution_method").eq("entity_id", source.id);
          for (const ss of sourceSigs || []) {
            await db.from("signal_entities").upsert({ signal_id: ss.signal_id, entity_id: target.id, resolution_method: ss.resolution_method }, { onConflict: "signal_id,entity_id" });
          }
          // Archive source
          await db.from("entities").update({ status: "archived" }).eq("id", source.id);
          results.push(`Merged "${source.canonical_name}" → "${target.canonical_name}" (moved links, archived source)`);
          break;
        }
        case "link_entity": {
          const { data: ent } = await db.from("entities").select("id, canonical_name").eq("user_id", userId).ilike("canonical_name", `%${cmd.entity_name}%`).limit(1).single();
          const { data: cas } = await db.from("cases").select("id").eq("user_id", userId).eq("case_number", cmd.case_number).single();
          if (!ent || !cas) { results.push("Entity or case not found"); break; }
          const { error } = await db.from("case_entities").upsert({ case_id: cas.id, entity_id: ent.id, role: cmd.role || "related" }, { onConflict: "case_id,entity_id" });
          results.push(error ? `Failed: ${error.message}` : `Linked "${ent.canonical_name}" to case #${cmd.case_number} (${cmd.role || "related"})`);
          break;
        }
        case "unlink_entity": {
          const { data: ent } = await db.from("entities").select("id").eq("user_id", userId).ilike("canonical_name", `%${cmd.entity_name}%`).limit(1).single();
          const { data: cas } = await db.from("cases").select("id").eq("user_id", userId).eq("case_number", cmd.case_number).single();
          if (!ent || !cas) { results.push("Entity or case not found"); break; }
          await db.from("case_entities").delete().eq("case_id", cas.id).eq("entity_id", ent.id);
          results.push(`Unlinked entity from case #${cmd.case_number}`);
          break;
        }
        case "list_signals": {
          let q = db.from("signals")
            .select("id, sender_identifier, channel_identifier, status, occurred_at, raw_payload, case_id")
            .eq("user_id", userId);
          if (cmd.status) q = q.eq("status", cmd.status);
          if (cmd.case_number) {
            const { data: c } = await db.from("cases").select("id").eq("user_id", userId).eq("case_number", cmd.case_number).single();
            if (c) q = q.eq("case_id", c.id);
            else { results.push(`Case #${cmd.case_number} not found`); break; }
          }
          if (cmd.entity_name) {
            const { data: ent } = await db.from("entities").select("id").eq("user_id", userId).ilike("canonical_name", `%${cmd.entity_name}%`).limit(1).single();
            if (ent) {
              const { data: sigIds } = await db.from("signal_entities").select("signal_id").eq("entity_id", ent.id);
              if (sigIds?.length) q = q.in("id", sigIds.map(s => s.signal_id));
              else { results.push("No signals for this entity"); break; }
            }
          }
          q = q.order("occurred_at", { ascending: false }).limit(cmd.limit || 20);
          const { data: sigList } = await q;
          if (!sigList?.length) { results.push("No signals found"); break; }
          const lines = sigList.map(s => {
            const payload = s.raw_payload as Record<string, unknown> || {};
            const content = (payload.content as string || "").slice(0, 100);
            const sender = payload.sender_name || s.sender_identifier || "unknown";
            return `[${s.occurred_at?.slice(0, 16)}] (${s.status}) ${sender}: ${content}`;
          });
          results.push(`Signals (${sigList.length}):\n${lines.join("\n")}`);
          break;
        }
        case "trigger_scan": {
          const origin = process.env.NEXT_PUBLIC_APP_URL || "";
          if (origin) await fetch(`${origin}/api/agent/scan`, { method: "POST" });
          results.push("Triggered full scan");
          break;
        }
        case "scan_case": {
          const origin = process.env.NEXT_PUBLIC_APP_URL || "";
          const { data: c } = await db.from("cases")
            .select("id").eq("user_id", userId).eq("case_number", cmd.case_number).single();
          if (origin && c) await fetch(`${origin}/api/agent/scan/${c.id}`, { method: "POST" });
          results.push(`Triggered scan for case #${cmd.case_number}`);
          break;
        }
        case "web_search": {
          try {
            const searchModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const searchResult = await searchModel.generateContent({
              contents: [{ role: "user", parts: [{ text: cmd.query }] }],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tools: [{ googleSearch: {} } as any],
            });
            const searchText = searchResult.response.text();
            results.push(`Search results for "${cmd.query}":\n${searchText.slice(0, 1500)}`);
          } catch (e) {
            results.push(`Search failed: ${e instanceof Error ? e.message : "unknown"}`);
          }
          break;
        }
        case "generate_image": {
          if (!tgToken || !chatId) { results.push("Cannot send image — no chat context"); break; }
          try {
            await sendUploadAction(tgToken, chatId, "upload_photo");
            const imgBuffer = await generateImage(cmd.prompt);
            await sendPhoto(tgToken, chatId, imgBuffer, cmd.prompt.slice(0, 200));
            results.push(`Generated image: "${cmd.prompt.slice(0, 80)}"`);
          } catch (e) {
            results.push(`Image generation failed: ${e instanceof Error ? e.message : "unknown"}`);
          }
          break;
        }
        case "generate_video": {
          if (!tgToken || !chatId) { results.push("Cannot send video — no chat context"); break; }
          try {
            await sendUploadAction(tgToken, chatId, "upload_video");
            await sendMessage(tgToken, chatId, `Generating video... this takes up to 2 minutes.`);
            const vidBuffer = await generateVideo(cmd.prompt);
            await sendVideo(tgToken, chatId, vidBuffer, cmd.prompt.slice(0, 200));
            results.push(`Generated video: "${cmd.prompt.slice(0, 80)}"`);
          } catch (e) {
            results.push(`Video generation failed: ${e instanceof Error ? e.message : "unknown"}`);
          }
          break;
        }
        case "reply_voice": {
          if (!tgToken || !chatId) { results.push("Cannot send voice — no chat context"); break; }
          try {
            await sendVoiceReply(tgToken, chatId, cmd.text);
            results.push("Sent voice reply");
          } catch (e) {
            // Fallback to text if TTS fails
            if (tgToken && chatId) await sendMessage(tgToken, chatId, cmd.text);
            results.push(`Voice failed, sent text instead: ${e instanceof Error ? e.message : "unknown"}`);
          }
          break;
        }
      }
    } catch (err) {
      results.push(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return results;
}

// ─── Main LLM call ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are TrustedClaw's Telegram command center — a real-time operational agent.
You are chatting directly with the system owner via Telegram. Be concise, direct, and actionable.
Respond in the same language the user writes (Hebrew or English).

You have FULL access to the system. You can see all open cases, entities, tasks, and signals.
You answer questions about the system state, give updates, and take action when asked.

ACTIONS — Include a "commands" array in your JSON response. Available commands:

CASES:
- {"type":"create_case","title":"...","summary":"...","urgency":1-5,"importance":1-5}
- {"type":"close_case","case_number":N}
- {"type":"update_case","case_number":N,"status":"...","urgency":N,"importance":N,"summary":"...","title":"..."}
- {"type":"merge_cases","from_number":N,"into_number":N,"reason":"..."}
- {"type":"list_cases","status":"open|closed|active","search":"keyword","limit":N} — query cases. status "active" = all non-closed/merged
- {"type":"get_case","case_number":N} — full case details: entities, signals, tasks, events

ENTITIES:
- {"type":"create_entity","name":"...","entity_type":"person|company|project|invoice|contract|product|bot|other","phone":"...","email":"...","telegram_handle":"..."}
- {"type":"update_entity","name":"search name","entity_id":"uuid","canonical_name":"new name","entity_type":"...","phone":"...","email":"...","telegram_handle":"...","whatsapp_number":"...","website":"...","external_id":"..."} — find by name or entity_id, update any fields
- {"type":"approve_entity","name":"..." or "entity_id":"uuid"} — activate a proposed entity
- {"type":"reject_entity","name":"..." or "entity_id":"uuid"}
- {"type":"merge_entities","source_name":"duplicate","target_name":"canonical","reason":"..."} — merge duplicate into target, move all links, archive source
- {"type":"list_entities","entity_type":"person","status":"active|proposed|rejected|archived","search":"keyword","limit":N}
- {"type":"get_entity","name":"..." or "entity_id":"uuid"} — full entity details: contacts, linked cases, recent signals
- {"type":"link_entity","entity_name":"...","case_number":N,"role":"primary|related|mentioned"} — connect entity to case
- {"type":"unlink_entity","entity_name":"...","case_number":N} — disconnect entity from case

TASKS:
- {"type":"create_task","title":"...","case_number":N,"due_at":"ISO8601","scheduled_at":"ISO8601","description":"..."}
- {"type":"close_task","task_id":"uuid-prefix"}
- {"type":"update_task","task_id":"uuid-prefix","title":"...","description":"...","due_at":"ISO8601","scheduled_at":"ISO8601"}
- {"type":"reopen_task","task_id":"uuid-prefix"}
- {"type":"list_tasks","status":"open|closed","case_number":N,"search":"keyword","limit":N}

SIGNALS:
- {"type":"list_signals","case_number":N,"entity_name":"...","status":"pending|processed|ignored","limit":N} — view signals by case or entity

SCANNING:
- {"type":"scan_case","case_number":N}
- {"type":"trigger_scan"}

MEDIA & SEARCH:
- {"type":"web_search","query":"search query"} — search the internet for news, info, prices, anything
- {"type":"generate_image","prompt":"detailed image description"} — generate an image with AI
- {"type":"generate_video","prompt":"detailed video description"} — generate a short video with AI (takes ~1-2min)
- {"type":"reply_voice","text":"what to say"} — reply with a voice message (TTS)

RESPONSE FORMAT — Always return valid JSON:
{
  "reply": "Your message to the user (plain text, concise)",
  "commands": []  // optional array of actions to execute
}

RULES:
- Be brief. This is Telegram, not email.
- If the user asks about cases/entities/tasks, USE THE QUERY COMMANDS (list_cases, get_case, list_entities, get_entity, list_tasks, list_signals) to get FRESH data, then answer. The system state is a summary — use commands for details.
- If asked to create/close/update/merge, DO IT via commands and confirm.
- Scale: urgency/importance 1=critical, 5=minimal.
- Don't ask for confirmation on simple ops — just do it and report.
- For complex/destructive ops (merge entities, bulk close), confirm first.
- Entity/task lookup by name is fuzzy (ILIKE %name%) — use partial names.
- For task IDs: the system shows [8-char-prefix] — use that prefix, but note commands need the full UUID. If you only have a prefix, list_tasks first to find the full ID.
- You can be proactive — suggest next steps, flag issues, recommend actions.
- ALWAYS return valid JSON. No markdown, no code blocks, just JSON.
- Messages prefixed with [Voice message] are transcriptions of voice notes — ALWAYS reply with reply_voice command so the user gets a voice reply back. Match the language they spoke in.
- Use web_search when the user asks about news, prices, weather, current events, or anything you don't know.
- You can chain multiple commands — e.g. list + get + update in sequence.
- Set "continue" to true when you need another iteration (e.g. list_entities to find ID, then update_entity with that ID).

MULTI-STEP: If you need to do something that requires multiple steps (search then act, or check then decide), set "continue": true and the system will call you again with the results of your commands. You get up to 5 iterations.

RESPONSE FORMAT:
{
  "reply": "message to user (shown after all iterations complete, or as progress update)",
  "commands": [],
  "continue": false  // set true if you need another iteration after commands execute
}`;

async function callBot(
  systemContext: string,
  conversationHistory: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<{ reply: string; commands: BotCommand[]; shouldContinue: boolean }> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
    systemInstruction: SYSTEM_PROMPT,
  });

  const contents = [
    // System context as first user message
    { role: "user" as const, parts: [{ text: `[SYSTEM CONTEXT — current state of the system]\n${systemContext}` }] },
    { role: "model" as const, parts: [{ text: '{"reply":"Ready. What do you need?","commands":[]}' }] },
    // Conversation history
    ...conversationHistory.map(m => ({
      role: (m.role === "user" ? "user" : "model") as "user" | "model",
      parts: [{ text: m.role === "user" ? m.content : `{"reply":${JSON.stringify(m.content)},"commands":[]}` }],
    })),
    // Current message
    { role: "user" as const, parts: [{ text: userMessage }] },
  ];

  const result = await model.generateContent({ contents });
  const raw = result.response.text();

  try {
    const parsed = JSON.parse(raw);
    return {
      reply: parsed.reply || raw,
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      shouldContinue: !!parsed.continue,
    };
  } catch {
    return { reply: raw, commands: [], shouldContinue: false };
  }
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function handleTelegramUpdate(update: TgUpdate, token: string, userId: string, gateId: string) {
  const db = createServiceClient();

  // Handle callback queries (inline buttons)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat.id;
    if (!chatId || !cb.data) return;
    await answerCallback(token, cb.id);
    // Treat callback data as a user message
    await processMessage(db, token, userId, gateId, chatId, cb.data);
    return;
  }

  const msg = update.message;
  if (!msg?.from) return;

  // Handle voice messages — transcribe first
  if (msg.voice) {
    await sendTyping(token, msg.chat.id);
    try {
      const transcript = await transcribeVoice(token, msg.voice.file_id);
      if (!transcript) {
        await sendMessage(token, msg.chat.id, "Could not transcribe voice message.");
        return;
      }
      await processMessage(db, token, userId, gateId, msg.chat.id, `[Voice message] ${transcript}`);
    } catch (err) {
      console.error("[telegram-bot] voice transcription error:", err);
      await sendMessage(token, msg.chat.id, "Failed to process voice message.");
    }
    return;
  }

  if (!msg.text) return;
  await processMessage(db, token, userId, gateId, msg.chat.id, msg.text.trim());
}

async function processMessage(db: SupabaseClient, token: string, userId: string, _gateId: string, chatId: number, text: string) {
  await sendTyping(token, chatId);

  try {
    const [systemContext, history] = await Promise.all([
      buildSystemContext(db, userId),
      getConversationHistory(db, userId, chatId),
    ]);

    // Save user message
    await saveMessage(db, userId, chatId, "user", text);

    // Agentic loop — up to 5 iterations
    const MAX_ITERATIONS = 5;
    let currentInput = text;
    let finalReply = "";
    let allCmdResults: string[] = [];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Keep typing indicator alive
      if (i > 0) await sendTyping(token, chatId);

      const { reply, commands, shouldContinue } = await callBot(
        systemContext,
        [...history, ...allCmdResults.length > 0 ? [{ role: "assistant" as const, content: finalReply }, { role: "user" as const, content: `[System: command results]\n${allCmdResults.join("\n")}` }] : []],
        currentInput,
      );

      finalReply = reply;

      // Execute commands
      if (commands.length > 0) {
        const results = await executeCommands(db, userId, commands, token, chatId);
        allCmdResults.push(...results);
      }

      // If the bot doesn't need another iteration, we're done
      if (!shouldContinue || commands.length === 0) break;

      // Feed results back for next iteration
      currentInput = `[Previous step results]\n${allCmdResults.join("\n")}\n\nContinue with your plan.`;
    }

    // Build final message
    let output = finalReply;
    if (allCmdResults.length > 0) {
      output += "\n\n" + allCmdResults.map(r => `✓ ${r}`).join("\n");
    }

    // Save assistant reply
    await saveMessage(db, userId, chatId, "assistant", finalReply);

    await sendMessage(token, chatId, output);
  } catch (err) {
    console.error("[telegram-bot]", err);
    await sendMessage(token, chatId, `Error: ${err instanceof Error ? err.message : "Something went wrong"}`);
  }
}
