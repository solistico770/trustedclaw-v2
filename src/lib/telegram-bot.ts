import { createServiceClient } from "@/lib/supabase-server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupabaseClient } from "@supabase/supabase-js";

const TG_API = "https://api.telegram.org/bot";
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
  | { type: "web_search"; query: string };

async function executeCommands(db: SupabaseClient, userId: string, commands: BotCommand[]): Promise<string[]> {
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
- Messages prefixed with [Voice message] are transcriptions of voice notes — treat them naturally.
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
        const results = await executeCommands(db, userId, commands);
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
