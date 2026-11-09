"use client";

import { useEffect, useState } from "react";
import type { Language } from "./types";
import { LANGUAGE_STORAGE_KEY } from "./types";
import { translations } from "./translations";
import { HeroSection } from "./components/HeroSection";
import { NarrativeSections } from "./components/NarrativeSections";
import { VisitFormSection } from "./components/VisitFormSection";
import { FutureHorizonSection } from "./components/FutureHorizonSection";

export default function VisitPage() {
  const [language, setLanguage] = useState<Language>("en");

  // Restore preferred language
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored === "en" || stored === "id") {
        setLanguage(stored);
      }
    } catch {
      // Storage unavailable
    }
  }, []);

  function handleLanguageChange(nextLang: Language) {
    setLanguage(nextLang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLang);
    } catch {
      // Storage unavailable
    }
  }

  function handleScrollToVisit() {
    const el = document.getElementById("visit-workspace");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <div className="min-h-screen bg-[#141210] text-[#f3eee4] selection:bg-[#d2b071] selection:text-[#161412]">
      <main>
        {/* 1. Hero with 3D Living Business Landscape */}
        <HeroSection
          language={language}
          onLanguageChange={handleLanguageChange}
          onStartVisit={handleScrollToVisit}
        />

        {/* 2. Storytelling & Inquiry Methodology */}
        <NarrativeSections language={language} />

        {/* 3. The Guided Field Visit Form */}
        <VisitFormSection language={language} />

        {/* 4. What Happens to Discovered Knowledge (Horizon) */}
        <FutureHorizonSection language={language} />
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[#75856c]/25 bg-[#26352b] px-5 py-7 text-xs text-[#e6e8dc] sm:px-8 md:px-12">
        <span className="font-medium tracking-[.16em]">DIGITAL YOUTH</span>
        <span className="text-[#d0d5c7]">{translations[language].footerQuote}</span>
        <a href="/admin/login" className="text-[#d0d5c7] underline-offset-4 hover:underline">{language === "en" ? "Administration" : "Administrasi"}</a>
      </footer>
    </div>
  );
}
