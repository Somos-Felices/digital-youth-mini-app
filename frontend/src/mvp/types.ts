export type Visit = {
  id: string; createdAt: string; updatedAt: string; businessName: string; businessType: string;
  tools: string[]; toolsOther: string; problemAreas: string[]; problemOther: string; mainDifficulty: string;
  whatsapp: string; contactConsent: boolean;
};
export type VisitInput = Omit<Visit, "id" | "createdAt" | "updatedAt">;
