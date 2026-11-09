"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Language, VisitForm, SubmissionResult } from "../types";
import {
  initialForm,
  DRAFT_STORAGE_KEY,
  toolValues,
  problemValues,
  frequencyValues,
} from "../types";
import { translations } from "../translations";
import { request, readableError } from "@/lib/api";

interface VisitFormSectionProps {
  language: Language;
}

export function VisitFormSection({ language }: VisitFormSectionProps) {
  const t = translations[language];
  const formT = t.formSection;

  // Form State
  const [form, setForm] = useState<VisitForm>(initialForm);
  const [hydrated, setHydrated] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Workflow State
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isExpansiveMode, setIsExpansiveMode] = useState<boolean>(false);

  // Submission & Network State
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string>("");
  const [serverError, setServerError] = useState<string>("");
  const [submissionSuccess, setSubmissionSuccess] = useState<SubmissionResult | null>(null);
  const submissionLock = useRef(false);

  // 1. Initial hydration & Draft Restoration
  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft) as Partial<VisitForm>;
        if (parsed.businessName || parsed.participantName || parsed.biggestOperationalPain) {
          setForm((prev) => ({ ...prev, ...parsed }));
          setDraftRestored(true);
        }
      }
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
    setHydrated(true);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 2. Draft Auto-Persistence (Excludes sensitive contact unless consent is explicitly granted)
  useEffect(() => {
    if (!hydrated || submissionSuccess) return;
    try {
      const draftToSave: VisitForm = {
        ...form,
        contactName: form.followUpConsent ? form.contactName : "",
        contactValue: form.followUpConsent ? form.contactValue : "",
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftToSave));
    } catch {
      // Storage unavailable or full
    }
  }, [form, hydrated, submissionSuccess]);

  // Update helper
  function updateField<K extends keyof VisitForm>(key: K, value: VisitForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setValidationError("");
    setServerError("");
  }

  // Multi-select toggle logic (handling 'none' exclusivity)
  function toggleItem(key: "currentTools" | "problemAreas", value: string) {
    const current = form[key];
    if (key === "currentTools" && value === "none") {
      updateField(key, current.includes("none") ? [] : ["none"]);
      return;
    }
    const filtered = current.filter((item) => item !== "none");
    updateField(
      key,
      filtered.includes(value)
        ? filtered.filter((item) => item !== value)
        : [...filtered, value]
    );
  }

  // Step Validation
  function validateCurrentStep(step: number): boolean {
    setValidationError("");
    if (step === 1) {
      if (
        !form.pilotLocation.trim() ||
        !form.participantName.trim() ||
        !form.businessName.trim() ||
        !form.businessType.trim()
      ) {
        setValidationError(formT.validationErrors.step1Required);
        return false;
      }
    } else if (step === 2) {
      if (!form.currentTools.length) {
        setValidationError(formT.validationErrors.toolsRequired);
        return false;
      }
    } else if (step === 3) {
      if (!form.problemAreas.length) {
        setValidationError(formT.validationErrors.problemsRequired);
        return false;
      }
    } else if (step === 4) {
      if (!form.biggestOperationalPain.trim() || form.biggestOperationalPain.trim().length < 10) {
        setValidationError(formT.validationErrors.painRequired);
        return false;
      }
    } else if (step === 5) {
      if (!form.painFrequency) {
        setValidationError(formT.validationErrors.frequencyRequired);
        return false;
      }
      if (form.followUpConsent) {
        if (!form.contactName.trim() || !form.contactValue.trim()) {
          setValidationError(formT.validationErrors.consentContactRequired);
          return false;
        }
      }
    }
    return true;
  }

  function handleNextStep() {
    if (validateCurrentStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 5));
      window.scrollTo({ top: document.getElementById("visit-workspace")?.offsetTop || 0, behavior: "smooth" });
    }
  }

  function handlePrevStep() {
    setValidationError("");
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: document.getElementById("visit-workspace")?.offsetTop || 0, behavior: "smooth" });
  }

  function handleResetDraft() {
    if (window.confirm(formT.draftClearConfirm)) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setForm(initialForm);
      setCurrentStep(1);
      setDraftRestored(false);
      setValidationError("");
      setServerError("");
    }
  }

  // Final Form Submission
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submissionLock.current) return;
    setValidationError("");
    setServerError("");

    // Full validation
    for (let s = 1; s <= 5; s++) {
      if (!validateCurrentStep(s)) {
        if (!isExpansiveMode) setCurrentStep(s);
        return;
      }
    }

    if (!navigator.onLine) {
      setServerError(formT.networkNotice.offlineBody);
      return;
    }

    submissionLock.current = true;
    setSaving(true);

    try {
      interface ApiSuccessResponse {
        message: string;
        submission: {
          id: number;
          submissionUuid: string;
          status: string;
        };
      }

      const response = await request<ApiSuccessResponse>("/api/diagnostic-submissions", {
        method: "POST",
        body: JSON.stringify({
          pilotLocation: form.pilotLocation.trim(),
          participantName: form.participantName.trim(),
          businessName: form.businessName.trim(),
          businessType: form.businessType.trim(),
          currentTools: form.currentTools,
          problemAreas: form.problemAreas,
          biggestOperationalPain: form.biggestOperationalPain.trim(),
          painFrequency: form.painFrequency,
          willingnessToPay: "unsure",
          budgetAmount: null,
          budgetCurrency: null,
          followUpConsent: form.followUpConsent,
          contactName: form.followUpConsent ? form.contactName.trim() : null,
          contactMethod: form.followUpConsent ? "whatsapp" : null,
          contactValue: form.followUpConsent ? form.contactValue.trim() : null,
        }),
      });

      // Clear draft on successful submission
      localStorage.removeItem(DRAFT_STORAGE_KEY);

      setSubmissionSuccess({
        id: response.submission.id,
        submissionUuid: response.submission.submissionUuid,
        status: response.submission.status,
        submittedAt: new Date().toLocaleTimeString(),
        businessName: form.businessName,
        businessType: form.businessType,
      });

      // Reset form state
      setForm(initialForm);
      setCurrentStep(1);
    } catch (err) {
      setServerError(readableError(err));
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  }

  // ---------------- SUCCESS SCREEN ----------------
  if (submissionSuccess) {
    const s = formT.successState;
    return (
      <section id="visit-workspace" className="py-20 md:py-28 bg-[#100f0d] text-[#f3eee4]">
        <div className="max-w-2xl mx-auto px-5 sm:px-8">
          <div className="p-8 sm:p-12 rounded-3xl bg-[#1d1a16] border border-[#d2b071] shadow-2xl text-center relative overflow-hidden">
            {/* Ambient gold glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-[#d2b071]/15 blur-3xl" />

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase bg-[#2a241e] text-[#d2b071] border border-[#b69355]/40 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#789171]" />
              {s.badge}
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl text-[#f3eee4] font-normal mb-4">
              {s.title}
            </h2>

            <p className="text-sm sm:text-base text-[#c6bdb0] leading-relaxed mb-8 font-light">
              {s.lead}
            </p>

            {/* Submission Receipt Meta */}
            <div className="p-5 rounded-2xl bg-[#141210] border border-[#b69355]/20 text-left space-y-3 mb-8 text-xs font-mono">
              <div className="flex justify-between items-center py-1 border-b border-[#b69355]/10">
                <span className="text-[#a99e8e]">{s.businessLabel}:</span>
                <span className="text-[#f3eee4] font-semibold">{submissionSuccess.businessName}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#b69355]/10">
                <span className="text-[#a99e8e]">{s.typeLabel}:</span>
                <span className="text-[#e4dbcc]">{submissionSuccess.businessType}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#b69355]/10">
                <span className="text-[#a99e8e]">{s.refLabel}:</span>
                <span className="text-[#d2b071] break-all">{submissionSuccess.submissionUuid}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[#a99e8e]">{s.statusLabel}:</span>
                <span className="text-[#789171] font-semibold">{s.statusReceived}</span>
              </div>
            </div>

            <p className="text-xs text-[#a99e8e] italic mb-8">
              {s.note}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                type="button"
                onClick={() => setSubmissionSuccess(null)}
                className="px-6 py-3.5 rounded-xl bg-[#d2b071] text-[#161412] font-semibold text-xs tracking-wider uppercase hover:bg-[#dec28e] transition-all shadow-md"
              >
                {s.actionNew}
              </button>
              <a
                href="/"
                className="px-6 py-3.5 rounded-xl bg-[#28241f] text-[#f3eee4] font-semibold text-xs tracking-wider uppercase hover:bg-[#342f29] transition-all border border-[#b69355]/30 text-center"
              >
                {s.actionHome}
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ---------------- ACTIVE FORM INTERFACE ----------------
  return (
    <section id="visit-workspace" className="py-20 md:py-28 bg-[#12100e] text-[#f3eee4] border-t border-[#b69355]/20">
      <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
        {/* Workspace Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d2b071]" />
            <span className="text-[11px] font-mono tracking-[0.25em] uppercase text-[#d2b071]">
              {formT.eyebrow}
            </span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-[#f3eee4] mb-4">
            {formT.title}
          </h2>
          <p className="text-sm sm:text-base text-[#c6bdb0] font-light leading-relaxed">
            {formT.subtitle}
          </p>

          {/* Offline / Draft Status Banner */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            {!isOnline ? (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-[#381c16] text-[#e09180] border border-[#a64d3b]">
                <span className="w-2 h-2 rounded-full bg-[#a64d3b] animate-pulse" />
                {formT.draftBadgeOffline}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-[#1d1a16] text-[#c6bdb0] border border-[#b69355]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#789171]" />
                {formT.draftBadgeSaved}
              </span>
            )}

            {draftRestored && (
              <span className="text-xs text-[#d2b071] font-mono italic">
                {formT.draftRestoredNotification}
              </span>
            )}

            {(form.businessName || form.participantName || form.biggestOperationalPain) && (
              <button
                type="button"
                onClick={handleResetDraft}
                className="text-xs text-[#a99e8e] hover:text-[#d2b071] underline underline-offset-4 ml-2"
              >
                {formT.draftClearButton}
              </button>
            )}
          </div>
        </div>

        {/* View Mode Switcher (Guided vs Expansive) & Step Progress */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-4 border-b border-[#b69355]/20">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((stepNum) => {
              const isCurrent = currentStep === stepNum;
              const isCompleted = currentStep > stepNum;
              return (
                <button
                  key={stepNum}
                  type="button"
                  onClick={() => {
                    if (isCompleted || validateCurrentStep(currentStep)) {
                      setCurrentStep(stepNum);
                    }
                  }}
                  className={`w-9 h-9 rounded-xl font-mono text-xs font-semibold flex items-center justify-center transition-all ${
                    isCurrent
                      ? "bg-[#d2b071] text-[#161412] shadow-md shadow-[#d2b071]/20 scale-105"
                      : isCompleted
                      ? "bg-[#28231c] text-[#d2b071] border border-[#b69355]/40"
                      : "bg-[#181614] text-[#a99e8e] border border-[#b69355]/15 opacity-60"
                  }`}
                  aria-label={t.goToStep.replace("{step}", String(stepNum))}
                >
                  0{stepNum}
                </button>
              );
            })}
            <span className="text-xs font-mono text-[#a99e8e] ml-2 hidden sm:inline">
              {formT.stepCounter.replace("{current}", String(currentStep)).replace("{total}", "5")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsExpansiveMode(!isExpansiveMode)}
              className="text-xs font-mono text-[#d2b071] hover:text-[#e4dbcc] px-3 py-1.5 rounded-lg border border-[#b69355]/30 bg-[#1c1916]"
            >
              {isExpansiveMode ? formT.viewModes.stepByStep : formT.viewModes.allQuestions}
            </button>
          </div>
        </div>

        {/* The Form Shell */}
        <form onSubmit={handleSubmit} className="space-y-10">
          {/* STEP 1: CONTEXT & PEOPLE */}
          {(isExpansiveMode || currentStep === 1) && (
            <div className="p-6 sm:p-10 rounded-3xl bg-[#1a1715] border border-[#b69355]/30 shadow-xl space-y-6">
              <div className="border-b border-[#b69355]/20 pb-4">
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#d2b071] block mb-1">
                  {formT.step1.badge}
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-normal text-[#f3eee4]">
                  {formT.step1.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#a99e8e] mt-1 font-light">
                  {formT.step1.desc}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Location */}
                <div className="space-y-2">
                  <label htmlFor="field-pilot-location" className="block text-xs font-mono uppercase tracking-wider text-[#d2b071]">
                    {formT.step1.pilotLocation} *
                  </label>
                  <input
                    id="field-pilot-location"
                    required
                    minLength={2}
                    maxLength={100}
                    value={form.pilotLocation}
                    onChange={(e) => updateField("pilotLocation", e.target.value)}
                    placeholder={formT.step1.pilotLocationPlaceholder}
                    className="w-full px-4 py-3.5 rounded-xl bg-[#24201c] border border-[#b69355]/30 text-[#f3eee4] placeholder-[#76591f]/70 focus:outline-none focus:border-[#d2b071] focus:ring-1 focus:ring-[#d2b071] text-sm"
                  />
                  <p className="text-[11px] text-[#a99e8e]">{formT.step1.pilotLocationHint}</p>
                </div>

                {/* Participant Name */}
                <div className="space-y-2">
                  <label htmlFor="field-participant-name" className="block text-xs font-mono uppercase tracking-wider text-[#d2b071]">
                    {formT.step1.participantName} *
                  </label>
                  <input
                    id="field-participant-name"
                    required
                    minLength={2}
                    maxLength={120}
                    value={form.participantName}
                    onChange={(e) => updateField("participantName", e.target.value)}
                    placeholder={formT.step1.participantNamePlaceholder}
                    className="w-full px-4 py-3.5 rounded-xl bg-[#24201c] border border-[#b69355]/30 text-[#f3eee4] placeholder-[#76591f]/70 focus:outline-none focus:border-[#d2b071] focus:ring-1 focus:ring-[#d2b071] text-sm"
                  />
                  <p className="text-[11px] text-[#a99e8e]">{formT.step1.participantNameHint}</p>
                </div>

                {/* Business Name */}
                <div className="space-y-2">
                  <label htmlFor="field-business-name" className="block text-xs font-mono uppercase tracking-wider text-[#d2b071]">
                    {formT.step1.businessName} *
                  </label>
                  <input
                    id="field-business-name"
                    required
                    minLength={2}
                    maxLength={160}
                    value={form.businessName}
                    onChange={(e) => updateField("businessName", e.target.value)}
                    placeholder={formT.step1.businessNamePlaceholder}
                    className="w-full px-4 py-3.5 rounded-xl bg-[#24201c] border border-[#b69355]/30 text-[#f3eee4] placeholder-[#76591f]/70 focus:outline-none focus:border-[#d2b071] focus:ring-1 focus:ring-[#d2b071] text-sm"
                  />
                  <p className="text-[11px] text-[#a99e8e]">{formT.step1.businessNameHint}</p>
                </div>

                {/* Business Type */}
                <div className="space-y-2">
                  <label htmlFor="field-business-type" className="block text-xs font-mono uppercase tracking-wider text-[#d2b071]">
                    {formT.step1.businessType} *
                  </label>
                  <input
                    id="field-business-type"
                    required
                    minLength={2}
                    maxLength={100}
                    value={form.businessType}
                    onChange={(e) => updateField("businessType", e.target.value)}
                    placeholder={formT.step1.businessTypePlaceholder}
                    className="w-full px-4 py-3.5 rounded-xl bg-[#24201c] border border-[#b69355]/30 text-[#f3eee4] placeholder-[#76591f]/70 focus:outline-none focus:border-[#d2b071] focus:ring-1 focus:ring-[#d2b071] text-sm"
                  />
                  <p className="text-[11px] text-[#a99e8e]">{formT.step1.businessTypeHint}</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CURRENT TOOLS */}
          {(isExpansiveMode || currentStep === 2) && (
            <div className="p-6 sm:p-10 rounded-3xl bg-[#1a1715] border border-[#b69355]/30 shadow-xl space-y-6">
              <div className="border-b border-[#b69355]/20 pb-4">
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#d2b071] block mb-1">
                  {formT.step2.badge}
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-normal text-[#f3eee4]">
                  {formT.step2.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#a99e8e] mt-1 font-light">
                  {formT.step2.desc}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {toolValues.map((toolKey) => {
                  const isChecked = form.currentTools.includes(toolKey);
                  const toolInfo = formT.step2.tools[toolKey];
                  return (
                    <label
                      key={toolKey}
                      className={`p-4 rounded-2xl border cursor-pointer flex items-start gap-3.5 transition-all select-none ${
                        isChecked
                          ? "bg-[#2a231b] border-[#d2b071] shadow-md shadow-[#d2b071]/10"
                          : "bg-[#221f1c] border-[#b69355]/20 hover:border-[#b69355]/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem("currentTools", toolKey)}
                        className="mt-1 w-5 h-5 rounded border-[#b69355] text-[#d2b071] focus:ring-[#d2b071] accent-[#d2b071]"
                      />
                      <div className="flex-1">
                        <span className="font-serif text-base text-[#f3eee4] font-normal block">
                          {toolInfo.label}
                        </span>
                        <span className="text-xs text-[#a99e8e] font-light leading-snug block mt-0.5">
                          {toolInfo.sub}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-[#b69355] font-mono">{formT.step2.toolsHint}</p>
            </div>
          )}

          {/* STEP 3: PROBLEM AREAS */}
          {(isExpansiveMode || currentStep === 3) && (
            <div className="p-6 sm:p-10 rounded-3xl bg-[#1a1715] border border-[#b69355]/30 shadow-xl space-y-6">
              <div className="border-b border-[#b69355]/20 pb-4">
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#d2b071] block mb-1">
                  {formT.step3.badge}
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-normal text-[#f3eee4]">
                  {formT.step3.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#a99e8e] mt-1 font-light">
                  {formT.step3.desc}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {problemValues.map((probKey) => {
                  const isChecked = form.problemAreas.includes(probKey);
                  const probInfo = formT.step3.problems[probKey];
                  return (
                    <label
                      key={probKey}
                      className={`p-4 rounded-2xl border cursor-pointer flex items-start gap-3.5 transition-all select-none ${
                        isChecked
                          ? "bg-[#2a231b] border-[#d2b071] shadow-md shadow-[#d2b071]/10"
                          : "bg-[#221f1c] border-[#b69355]/20 hover:border-[#b69355]/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem("problemAreas", probKey)}
                        className="mt-1 w-5 h-5 rounded border-[#b69355] text-[#d2b071] focus:ring-[#d2b071] accent-[#d2b071]"
                      />
                      <div className="flex-1">
                        <span className="font-serif text-base text-[#f3eee4] font-normal block">
                          {probInfo.label}
                        </span>
                        <span className="text-xs text-[#a99e8e] font-light leading-snug block mt-0.5">
                          {probInfo.sub}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-[#b69355] font-mono">{formT.step3.problemsHint}</p>
            </div>
          )}

          {/* STEP 4: IN THEIR OWN WORDS */}
          {(isExpansiveMode || currentStep === 4) && (
            <div className="p-6 sm:p-10 rounded-3xl bg-[#1a1715] border border-[#b69355]/30 shadow-xl space-y-6">
              <div className="border-b border-[#b69355]/20 pb-4">
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#d2b071] block mb-1">
                  {formT.step4.badge}
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-normal text-[#f3eee4]">
                  {formT.step4.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#a99e8e] mt-1 font-light">
                  {formT.step4.desc}
                </p>
              </div>

              <div className="space-y-3">
                <label htmlFor="field-biggest-pain" className="block text-xs font-mono uppercase tracking-wider text-[#d2b071]">
                  {formT.step4.label} *
                </label>
                <textarea
                  id="field-biggest-pain"
                  required
                  rows={6}
                  minLength={10}
                  maxLength={2000}
                  value={form.biggestOperationalPain}
                  onChange={(e) => updateField("biggestOperationalPain", e.target.value)}
                  placeholder={formT.step4.placeholder}
                  className="w-full px-4 py-3.5 rounded-2xl bg-[#24201c] border border-[#b69355]/30 text-[#f3eee4] placeholder-[#76591f]/60 focus:outline-none focus:border-[#d2b071] focus:ring-1 focus:ring-[#d2b071] text-sm sm:text-base leading-relaxed"
                />
                <div className="flex justify-between items-center text-xs text-[#a99e8e]">
                  <span>{formT.step4.hint}</span>
                  <span className="font-mono">
                    {formT.step4.charCount.replace("{count}", String(form.biggestOperationalPain.length))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: FREQUENCY & RESPECTFUL CONTINUITY */}
          {(isExpansiveMode || currentStep === 5) && (
            <div className="p-6 sm:p-10 rounded-3xl bg-[#1a1715] border border-[#b69355]/30 shadow-xl space-y-8">
              <div className="border-b border-[#b69355]/20 pb-4">
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#d2b071] block mb-1">
                  {formT.step5.badge}
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-normal text-[#f3eee4]">
                  {formT.step5.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#a99e8e] mt-1 font-light">
                  {formT.step5.desc}
                </p>
              </div>

              {/* Frequency selection */}
              <div>
                <span className="block text-xs font-mono uppercase tracking-wider text-[#d2b071] mb-3">
                  {formT.step5.frequencyTitle} *
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {frequencyValues.map((freqKey) => {
                    const isSelected = form.painFrequency === freqKey;
                    const freqInfo = formT.step5.frequency[freqKey];
                    return (
                      <label
                        key={freqKey}
                        className={`p-4 rounded-xl border cursor-pointer flex items-start gap-3 transition-all select-none ${
                          isSelected
                            ? "bg-[#2a231b] border-[#d2b071] shadow-md shadow-[#d2b071]/10"
                            : "bg-[#221f1c] border-[#b69355]/20 hover:border-[#b69355]/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="painFrequency"
                          required
                          checked={isSelected}
                          onChange={() => updateField("painFrequency", freqKey)}
                          className="mt-1 w-4 h-4 text-[#d2b071] focus:ring-[#d2b071] accent-[#d2b071]"
                        />
                        <div>
                          <span className="font-serif text-base text-[#f3eee4] font-normal block">
                            {freqInfo.label}
                          </span>
                          <span className="text-[11px] text-[#a99e8e] block mt-0.5 font-light">
                            {freqInfo.sub}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Optional WhatsApp Follow-up consent */}
              <div className="p-6 rounded-2xl bg-[#221d18] border border-[#b69355]/30 space-y-4">
                <div>
                  <h4 className="font-serif text-lg sm:text-xl text-[#f3eee4] font-normal">
                    {formT.step5.consentBoxTitle}
                  </h4>
                  <p className="text-xs text-[#c6bdb0] mt-1 font-light">
                    {formT.step5.consentBoxDesc}
                  </p>
                </div>

                <label className="flex items-start gap-3 p-4 rounded-xl bg-[#2b251f] border border-[#b69355]/20 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.followUpConsent}
                    onChange={(e) => updateField("followUpConsent", e.target.checked)}
                    className="mt-1 w-5 h-5 rounded border-[#b69355] text-[#d2b071] focus:ring-[#d2b071] accent-[#d2b071]"
                  />
                  <div className="flex-1">
                    <span className="text-xs sm:text-sm text-[#f3eee4] font-medium block">
                      {formT.step5.consentLabel}
                    </span>
                    <span className="text-[11px] text-[#a99e8e] block mt-1 font-light">
                      {formT.step5.consentNotice}
                    </span>
                  </div>
                </label>

                {form.followUpConsent && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#b69355]/20 animate-fadeIn">
                    <div className="space-y-1.5">
                      <label htmlFor="field-contact-name" className="block text-xs font-mono uppercase tracking-wider text-[#d2b071]">
                        {formT.step5.contactName} *
                      </label>
                      <input
                        id="field-contact-name"
                        required={form.followUpConsent}
                        maxLength={120}
                        value={form.contactName}
                        onChange={(e) => updateField("contactName", e.target.value)}
                        placeholder={formT.step5.contactNamePlaceholder}
                        className="w-full px-4 py-3 rounded-xl bg-[#1c1916] border border-[#b69355]/40 text-[#f3eee4] placeholder-[#76591f]/60 text-sm focus:outline-none focus:border-[#d2b071]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="field-contact-value" className="block text-xs font-mono uppercase tracking-wider text-[#d2b071]">
                        {formT.step5.whatsapp} *
                      </label>
                      <input
                        id="field-contact-value"
                        required={form.followUpConsent}
                        type="tel"
                        maxLength={190}
                        value={form.contactValue}
                        onChange={(e) => updateField("contactValue", e.target.value)}
                        placeholder={formT.step5.whatsappPlaceholder}
                        className="w-full px-4 py-3 rounded-xl bg-[#1c1916] border border-[#b69355]/40 text-[#f3eee4] placeholder-[#76591f]/60 text-sm focus:outline-none focus:border-[#d2b071]"
                      />
                      <p className="text-[10px] text-[#a99e8e]">{formT.step5.whatsappHint}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Validation and Server Errors */}
          {validationError && (
            <div role="alert" className="p-4 rounded-xl bg-[#3a1b18] border border-[#a64d3b] text-[#f4aca0] text-xs font-mono flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#a64d3b]" />
              <span>{validationError}</span>
            </div>
          )}

          {serverError && (
            <div role="alert" className="p-4 rounded-xl bg-[#3a1b18] border border-[#a64d3b] text-[#f4aca0] text-xs font-mono flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#a64d3b]" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Workflow Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-[#b69355]/20">
            <div>
              {!isExpansiveMode && currentStep > 1 && (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="px-6 py-3.5 rounded-xl bg-[#24201c] text-[#c6bdb0] hover:text-[#f3eee4] border border-[#b69355]/30 text-xs font-mono uppercase tracking-wider transition-all"
                >
                  ← {formT.buttons.back}
                </button>
              )}
            </div>

            <div className="flex items-center gap-4">
              {!isExpansiveMode && currentStep < 5 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="px-7 py-3.5 rounded-xl bg-[#d2b071] text-[#161412] font-semibold text-xs tracking-wider uppercase hover:bg-[#dec28e] transition-all shadow-lg shadow-[#d2b071]/15"
                >
                  {formT.buttons.next} →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-8 py-4 rounded-xl bg-[#d2b071] text-[#161412] font-semibold text-xs tracking-wider uppercase hover:bg-[#dec28e] active:scale-[0.99] disabled:opacity-50 transition-all shadow-xl shadow-[#d2b071]/20"
                >
                  {saving ? formT.buttons.submitting : formT.buttons.submit}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
