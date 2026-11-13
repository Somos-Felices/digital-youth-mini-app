import type { Diagnostic } from "./diagnostics";
import { copy, type Language } from "./diagnostic-copy";

export type FieldVisitPayload = {
  submissionUuid: string;
  businessName: string;
  businessType: "food_beverage" | "accommodation" | "retail" | "services" | "other";
  businessTypeOther: string | null;
  currentTools: Array<"whatsapp" | "paper_pen" | "spreadsheet" | "nothing" | "other">;
  toolsOther: string | null;
  biggestOperationalPain: string;
  problemAreas: Array<"tourist_replies" | "social_media" | "bookings" | "translation" | "other">;
  contactName: string | null;
  whatsappNumber: string | null;
  followUpConsent: boolean;
};

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
const configuredBase = env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "");
export const remoteSubmissionEnabled = Boolean(configuredBase);

export function toFieldVisitPayload(data: Diagnostic, lang: Language, submissionUuid: string): FieldVisitPayload {
  const labels = copy[lang];
  const typeIndex = labels.categories.indexOf(data.businessType as never);
  const typeValues: FieldVisitPayload["businessType"][] = ["food_beverage", "accommodation", "retail", "services", "other"];
  const toolValues: Record<number, FieldVisitPayload["currentTools"][number]> = {
    0: "whatsapp", 1: "paper_pen", 2: "spreadsheet", 3: "nothing", 4: "other"
  };
  const problemAreaValues: FieldVisitPayload["problemAreas"] = ["tourist_replies", "social_media", "bookings", "translation", "other"];
  const selectedToolIndexes = data.tools.map((tool) => labels.tools.indexOf(tool as never)).filter((index) => index >= 0);
  const businessType = typeValues[typeIndex];
  const selectedProblemAreas = data.problemAreas.map((area) => labels.problemAreas.indexOf(area as never));
  if (!businessType || selectedToolIndexes.length !== data.tools.length || selectedProblemAreas.some((index) => index < 0)) {
    throw new Error("The selected answers could not be mapped to the submission contract.");
  }
  return {
    submissionUuid,
    businessName: data.businessName.trim(),
    businessType,
    businessTypeOther: businessType === "other" ? data.businessTypeOther.trim() || null : null,
    currentTools: selectedToolIndexes.map((index) => toolValues[index]),
    toolsOther: data.tools.includes(labels.tools[4]) ? data.toolsOther.trim() || null : null,
    biggestOperationalPain: data.pain.trim(),
    problemAreas: selectedProblemAreas.map((index) => problemAreaValues[index]),
    contactName: data.consent ? data.contactName.trim() || null : null,
    whatsappNumber: data.consent ? data.whatsapp.trim() || null : null,
    followUpConsent: data.consent
  };
}

export async function sendFieldVisitDiagnostic(payload: FieldVisitPayload): Promise<{ submissionUuid: string; duplicate: boolean }> {
  if (!configuredBase) throw new Error("Remote submission is not configured.");
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${configuredBase}/api/v2/field-visit-diagnostics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json().catch(() => null) as { error?: string; submission?: { submissionUuid?: string; status?: string; duplicate?: boolean } } | null;
    if (!response.ok || body?.submission?.status !== "received" || body.submission.submissionUuid !== payload.submissionUuid) {
      throw new Error(body?.error || "The server did not confirm receipt.");
    }
    return { submissionUuid: body.submission.submissionUuid, duplicate: Boolean(body.submission.duplicate) };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("The request timed out. It is safe to retry.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
