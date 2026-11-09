export type Language = "en" | "id";

export interface VisitForm {
  pilotLocation: string;
  participantName: string;
  businessName: string;
  businessType: string;
  currentTools: string[];
  problemAreas: string[];
  biggestOperationalPain: string;
  painFrequency: string;
  followUpConsent: boolean;
  contactName: string;
  contactValue: string;
}

export const initialForm: VisitForm = {
  pilotLocation: "Nusa Lembongan",
  participantName: "",
  businessName: "",
  businessType: "",
  currentTools: [],
  problemAreas: [],
  biggestOperationalPain: "",
  painFrequency: "",
  followUpConsent: false,
  contactName: "",
  contactValue: "",
};

export const DRAFT_STORAGE_KEY = "digital-youth-business-visit-draft-v1";
export const LANGUAGE_STORAGE_KEY = "digital-youth-visit-language-preference";

export const toolValues = [
  "whatsapp",
  "paper_records",
  "spreadsheets",
  "pos_system",
  "none",
  "other",
] as const;

export type ToolValue = typeof toolValues[number];

export const problemValues = [
  "tourist_replies",
  "social_media",
  "bookings",
  "translation",
  "other",
] as const;

export type ProblemValue = typeof problemValues[number];

export const frequencyValues = [
  "daily",
  "weekly",
  "monthly",
  "occasionally",
  "unsure",
] as const;

export type FrequencyValue = typeof frequencyValues[number];

export interface SubmissionResult {
  id: number;
  submissionUuid: string;
  status: string;
  submittedAt: string;
  businessName: string;
  businessType: string;
}
