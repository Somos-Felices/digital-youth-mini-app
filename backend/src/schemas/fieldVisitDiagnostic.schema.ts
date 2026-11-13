import { z } from "zod";

const businessTypeSchema = z.enum([
  "food_beverage",
  "accommodation",
  "retail",
  "services",
  "other"
]);

const toolSchema = z.enum([
  "whatsapp",
  "paper_pen",
  "spreadsheet",
  "nothing",
  "other"
]);

const problemAreaSchema = z.enum([
  "tourist_replies",
  "social_media",
  "bookings",
  "translation",
  "other"
]);

export const fieldVisitDiagnosticSchema = z.object({
  submissionUuid: z.string().uuid(),
  businessName: z.string().trim().min(1).max(140),
  businessType: businessTypeSchema,
  businessTypeOther: z.string().trim().max(100).optional().nullable(),
  currentTools: z.array(toolSchema)
    .min(1)
    .max(5)
    .refine((items) => new Set(items).size === items.length, "Duplicate tools are not allowed")
    .refine((items) => !items.includes("nothing") || items.length === 1, "Nothing cannot be combined with other tools"),
  toolsOther: z.string().trim().max(120).optional().nullable(),
  biggestOperationalPain: z.string().trim().min(1).max(500),
  problemAreas: z.array(problemAreaSchema)
    .min(1)
    .max(5)
    .refine((items) => new Set(items).size === items.length, "Duplicate problem areas are not allowed"),
  contactName: z.string().trim().max(140).optional().nullable(),
  whatsappNumber: z.string().trim().max(80).optional().nullable(),
  followUpConsent: z.boolean()
}).strict().superRefine((data, context) => {
  const businessTypeOther = data.businessTypeOther?.trim() || "";
  const toolsOther = data.toolsOther?.trim() || "";
  const hasOtherTool = data.currentTools.includes("other");
  const hasContactName = Boolean(data.contactName?.trim());
  const hasWhatsApp = Boolean(data.whatsappNumber?.trim());

  if (data.businessType === "other" && !businessTypeOther) {
    context.addIssue({ code: "custom", path: ["businessTypeOther"], message: "Please specify the business type" });
  }
  if (data.businessType !== "other" && businessTypeOther) {
    context.addIssue({ code: "custom", path: ["businessTypeOther"], message: "Business type details are only allowed for Other" });
  }
  if (hasOtherTool && !toolsOther) {
    context.addIssue({ code: "custom", path: ["toolsOther"], message: "Please specify the other tool" });
  }
  if (!hasOtherTool && toolsOther) {
    context.addIssue({ code: "custom", path: ["toolsOther"], message: "Other tool details are only allowed when Other is selected" });
  }
  if (!data.followUpConsent && (hasContactName || hasWhatsApp)) {
    context.addIssue({ code: "custom", path: ["followUpConsent"], message: "Contact information requires explicit consent" });
  }
  if (data.followUpConsent && !hasWhatsApp) {
    context.addIssue({ code: "custom", path: ["whatsappNumber"], message: "A WhatsApp number is required when follow-up is permitted" });
  } else if (hasWhatsApp) {
    const number = data.whatsappNumber?.trim() || "";
    const digitCount = number.replace(/\D/g, "").length;
    if (!/^\+?[0-9][0-9\s().-]{3,78}$/.test(number) || digitCount < 5 || digitCount > 20) {
      context.addIssue({ code: "custom", path: ["whatsappNumber"], message: "Enter a valid international WhatsApp number" });
    }
  }
});

export type FieldVisitDiagnosticInput = z.infer<typeof fieldVisitDiagnosticSchema>;
