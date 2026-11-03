import { z } from "zod";

const currentToolSchema = z.enum([
  "whatsapp",
  "paper_records",
  "spreadsheets",
  "pos_system",
  "none",
  "other"
]);

export const diagnosticSubmissionSchema = z.object({
  pilotLocation: z.string().trim().min(2).max(100),

  participantName: z.string().trim().min(2).max(120),

  businessName: z.string().trim().max(160).optional().nullable(),

  businessType: z.string().trim().min(2).max(100),

  currentTools: z.array(currentToolSchema)
    .min(1)
    .max(6)
    .refine(
      (tools) => new Set(tools).size === tools.length,
      "Duplicate tools are not allowed"
    )
    .refine(
      (tools) => !tools.includes("none") || tools.length === 1,
      "'None' cannot be combined with other tools"
    ),

  biggestOperationalPain: z.string().trim().min(10).max(2000),

  painFrequency: z.enum([
    "daily",
    "weekly",
    "monthly",
    "occasionally",
    "unsure"
  ]),

  willingnessToPay: z.enum([
    "yes",
    "maybe",
    "no",
    "unsure"
  ]),

  budgetAmount: z.number().positive().max(999999999).optional().nullable(),

  budgetCurrency: z.string()
    .regex(/^[A-Z]{3}$/)
    .optional()
    .nullable(),

  followUpConsent: z.boolean().default(false),

  contactName: z.string().trim().max(120).optional().nullable(),

  contactMethod: z.enum([
    "whatsapp",
    "phone",
    "email"
  ]).optional().nullable(),

  contactValue: z.string().trim().max(190).optional().nullable()
}).superRefine((data, ctx) => {
  if (data.budgetAmount != null && !data.budgetCurrency) {
    ctx.addIssue({
      code: "custom",
      path: ["budgetCurrency"],
      message: "Currency is required when a budget is provided"
    });
  }

  if (data.budgetCurrency && data.budgetAmount == null) {
    ctx.addIssue({
      code: "custom",
      path: ["budgetAmount"],
      message: "Budget amount is required when currency is provided"
    });
  }

  if (
    data.followUpConsent &&
    (!data.contactMethod || !data.contactValue)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["contactValue"],
      message: "Contact method and contact details are required when follow-up is permitted"
    });
  }
});

export type DiagnosticSubmissionInput =
  z.infer<typeof diagnosticSubmissionSchema>;
