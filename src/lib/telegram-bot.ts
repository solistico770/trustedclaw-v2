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

// ─── Image generation (Imagen 3) ────────────────────────────────────────────

async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY || "";

  // Use Gemini 2.0 Flash with image generation
  const res = await fetch(`${GEMINI_API_BASE}/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  const data = await res.json();

  // Extract image from response parts
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  throw new Error("No image generated — " + (data.error?.message || "model did not return an image"));
}

// ─── Video generation (Veo) ─────────────────────────────────────────────────

async function generateVideo(prompt: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY || "";

  // Start video generation (async operation)
  const startRes = await fetch(`${GEMINI_API_BASE}/models/veo-2.0-generate-001:predictLongRunning?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { aspectRatio: "16:9", durationSeconds: 5 },
    }),
  });

  const startData = await startRes.json();

  if (startData.error) {
    throw new Error(startData.error.message || "Veo API error");
  }

  // Poll for completion
  const opName = startData.name;
  if (!opName) {
    throw new Error("No operation name returned from Veo");
  }

  const maxWait = 120_000; // 2 minutes
  const pollInterval = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));

    const pollRes = await fetch(`${GEMINI_API_BASE}/${opName}?key=${apiKey}`);
    const pollData = await pollRes.json();

    if (pollData.done) {
      // Extract video from response
      const videoUri = pollData.response?.generatedSamples?.[0]?.video?.uri;
      if (videoUri) {
        // Download the video file
        const videoRes = await fetch(`${videoUri}&key=${apiKey}`);
        const videoBuffer = await videoRes.arrayBuffer();
        return Buffer.from(videoBuffer);
      }

      // Try inline data
      const b64 = pollData.response?.generatedSamples?.[0]?.video?.bytesBase64Encoded;
      if (b64) {
        return Buffer.from(b64, "base64");
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
  | { type: "update_case"; case_number: number; status?: string; urgency?: number; importance?: number; summary?: string }
  | { type: "merge_cases"; from_number: number; into_number: number; reason: string }
  | { type: "create_entity"; name: string; entity_type: string; phone?: string; email?: string; telegram_handle?: string }
  | { type: "create_task"; title: string; case_number?: number; due_at?: string }
  | { type: "close_task"; task_id: string }
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
            await db.from("cases").update(updates).eq("id", c.id);
            results.push(`Updated case #${cmd.case_number}`);
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
          await db.from("tasks").insert({
            user_id: userId,
            case_id: caseId,
            title: cmd.title,
            status: "open",
            due_at: cmd.due_at || null,
          });
          results.push(`Created task "${cmd.title}"`);
          break;
        }
        case "close_task": {
          await db.from("tasks").update({ status: "closed", closed_at: new Date().toISOString() })
            .eq("id", cmd.task_id).eq("user_id", userId);
          results.push(`Closed task`);
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

ACTIONS — When the user asks you to do something, include a "commands" array in your JSON response:
- {"type":"create_case","title":"...","summary":"...","urgency":1-5,"importance":1-5}
- {"type":"close_case","case_number":N}
- {"type":"update_case","case_number":N,"status":"...","urgency":N,"importance":N,"summary":"..."}
- {"type":"merge_cases","from_number":N,"into_number":N,"reason":"..."}
- {"type":"create_entity","name":"...","entity_type":"person|company|project","phone":"...","email":"...","telegram_handle":"..."}
- {"type":"create_task","title":"...","case_number":N,"due_at":"ISO8601"}
- {"type":"close_task","task_id":"uuid"}
- {"type":"scan_case","case_number":N}
- {"type":"trigger_scan"}
- {"type":"web_search","query":"search query"} — search the internet for news, info, prices, anything
- {"type":"generate_image","prompt":"detailed image description"} — generate an image with AI (Imagen)
- {"type":"generate_video","prompt":"detailed video description"} — generate a short video with AI (Veo, takes ~1-2min)
- {"type":"reply_voice","text":"what to say"} — reply with a voice message (TTS). Use when the user sent a voice message or asks for voice reply.

RESPONSE FORMAT — Always return valid JSON:
{
  "reply": "Your message to the user (plain text, concise)",
  "commands": []  // optional array of actions to execute
}

RULES:
- Be brief. This is Telegram, not email.
- If the user asks about cases/entities/tasks, answer from the system state provided.
- If asked to create/close/update/merge, DO IT via commands and confirm.
- Scale: urgency/importance 1=critical, 5=minimal.
- Don't ask for confirmation on simple ops — just do it and report.
- For complex/destructive ops (merge, bulk close), confirm first.
- You can be proactive — suggest next steps, flag issues, recommend actions.
- ALWAYS return valid JSON. No markdown, no code blocks, just JSON.
- Messages prefixed with [Voice message] are transcriptions of voice notes — ALWAYS reply with reply_voice command so the user gets a voice reply back. Match the language they spoke in.
- Use web_search when the user asks about news, prices, weather, current events, or anything you don't know.
- You can chain multiple commands — e.g. search + create case based on results.
- Set "continue" to true in your response if you need another iteration to complete the task (e.g. after a search, to analyze results and take action).

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
