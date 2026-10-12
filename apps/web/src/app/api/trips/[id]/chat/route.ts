import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiError, apiReply, readJson, validationError } from "@/lib/api-errors";
import { configuredProviders, type LlmMessage } from "@/lib/assistant/llm";
import { allowAssistantRequest } from "@/lib/assistant/rate-limit";
import { numbersGrounded, plannerTools, runPlannerTool } from "@/lib/trip-workflow/agent-tools";
import { log } from "@/lib/log";

const body = z.object({ message: z.string().trim().min(1).max(500), locale: z.enum(["en", "ur", "ur-Latn", "pa-Arab"]).default("en") });
const languages = { en: "English", ur: "Urdu (Arabic script)", "ur-Latn": "Roman Urdu", "pa-Arab": "Punjabi in Shahmukhi script" } as const;
const MAX_TURNS = 5;
const MAX_CALLS_PER_TURN = 4;

// Optional AI chat for one trip. The planner works fully without it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", "Choose a valid trip.", 400);
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const providers = configuredProviders();
  if (!providers.length) return apiError("AI_NOT_CONFIGURED", "The AI planner chat needs GEMINI_API_KEY or GROQ_API_KEY on the server. Every planner feature also works with the buttons.", 503);
  if (!allowAssistantRequest(`trip-chat:${access.profile.id}`)) return apiError("RATE_LIMITED", "Too many questions. Please wait a minute.", 429);

  const system = [
    "You help a driver in Faisalabad plan errands to save petrol. Use the tools; never guess businesses, availability, distances or prices.",
    `Reply in ${languages[parsed.data.locale]} in at most four short sentences.`,
    "Only state numbers that a tool returned. Availability other than CONFIRMED is uncertain; say so. Opening hours never prove anyone is there.",
    "You cannot send messages, book or start the trip yourself: request_availability_confirmation only proposes, and the user approves in the plan.",
    "Businesses marked demo are fictional; say so if you mention one.",
  ].join(" ");
  const toolOutputs: unknown[] = [parsed.data.message];
  const toolsUsed: string[] = [];

  for (const provider of providers) {
    const messages: LlmMessage[] = [{ role: "user", text: parsed.data.message }];
    let failed = false;
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const reply = await provider.generate({ system, messages, tools: plannerTools.map((tool) => tool.spec), temperature: 0.2, maxTokens: 500 });
      if (!reply) {
        failed = true;
        break;
      }
      if (!reply.toolCalls.length) {
        if (!reply.text || !numbersGrounded(reply.text, toolOutputs)) {
          log.warn("trip_chat_ungrounded", { provider: provider.id });
          return apiError("AI_UNGROUNDED", "The AI answer could not be checked against trip data, so it was not shown. Use the plan below.", 422);
        }
        await access.supabase.from("workflow_steps").insert({ itinerary_id: id.data, step: "agent_chat", status: "succeeded", actor: "llm", output_summary: { tools: toolsUsed, provider: provider.id } });
        return apiReply({ answer: reply.text, toolsUsed, provider: provider.id });
      }
      messages.push({ role: "assistant", text: reply.text, toolCalls: reply.toolCalls.slice(0, MAX_CALLS_PER_TURN), raw: reply.raw });
      const results = [];
      for (const call of reply.toolCalls.slice(0, MAX_CALLS_PER_TURN)) {
        const output = await runPlannerTool(access, id.data, call.name, call.args);
        toolOutputs.push(output);
        toolsUsed.push(call.name);
        results.push({ id: call.id, name: call.name, response: output });
      }
      messages.push({ role: "tool", results });
    }
    if (!failed) break;
  }
  return apiError("AI_UNAVAILABLE", "The AI service is unavailable or out of free quota. Use the plan controls instead.", 503);
}
