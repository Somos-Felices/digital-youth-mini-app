"use client";

import type { Language } from "../types";
import { translations } from "../translations";
import dynamic from "next/dynamic";

const BusinessLandscapeCanvas = dynamic(
  () => import("./BusinessLandscapeCanvas").then((module) => module.BusinessLandscapeCanvas),
  { ssr: false, loading: () => <HeroSceneFallback /> }
);

function HeroSceneFallback() {
  return (
    <div aria-hidden="true" className="relative h-[370px] w-full overflow-hidden rounded-[1.75rem] border border-[#6b7664]/25 bg-[radial-gradient(ellipse_at_55%_25%,#fff9e7,#d5d0c3)] sm:h-[500px] lg:h-[610px]">
      <div className="absolute inset-x-[10%] bottom-[14%] h-[20%] rounded-[50%] bg-[#7c8a75]/25 blur-sm" />
      <div className="absolute bottom-[28%] left-[14%] h-[23%] w-[32%] bg-gradient-to-br from-[#8d9a7e] to-[#596951] shadow-[14px_14px_0_#465545]" />
      <div className="absolute bottom-[34%] left-[39%] h-[34%] w-[39%] bg-gradient-to-br from-[#d1bb92] to-[#9d835e] shadow-[16px_16px_0_#716047]">
        <div className="absolute inset-x-[12%] bottom-0 top-[40%] border-x-[8px] border-t-[8px] border-[#52654f] bg-[#8da094]" />
      </div>
      <div className="absolute bottom-[32%] right-[12%] h-[17%] w-[20%] bg-gradient-to-br from-[#d78a68] to-[#a6503a] shadow-[12px_12px_0_#804332]" />
      <div className="absolute left-6 top-6 h-2 w-2 rounded-full bg-[#c96c4c]" />
    </div>
  );
}

interface HeroSectionProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onStartVisit: () => void;
}

export function HeroSection({
  language,
  onLanguageChange,
  onStartVisit,
}: HeroSectionProps) {
  const t = translations[language];

  return (
    <section className="relative w-full overflow-hidden border-b border-[#374737]/15 bg-[#f2efe6] pb-16 pt-7 text-[#26352b] md:pb-24 md:pt-10">
      <div className="pointer-events-none absolute -right-48 top-24 h-[660px] w-[660px] rounded-full bg-[#d8dfcf]/55 blur-[100px]" />

      <div className="max-w-[1440px] mx-auto px-5 sm:px-8 md:px-12">
        {/* Top Control Bar: Brand / Protocol Identifier & Language Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#374737]/15 pb-7">
          <div className="hidden items-center gap-7 text-xs font-medium text-[#596456] md:flex">
            <a href="#discovery-narrative" className="transition-colors hover:text-[#bf6445]">{t.navMethod}</a>
            <a href="#visit-workspace" className="transition-colors hover:text-[#bf6445]">{t.navVisit} <span aria-hidden="true">↗</span></a>
          </div>

          <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#62765e]/40 bg-[#e7e7dc] font-serif text-sm text-[#42543f]">
              DY
            </span>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#68745f]">
                {t.badge}
              </span>
              <span className="text-xs text-[#73796d]">
                {language === "en" ? "Field Inquiry Protocol 01" : "Protokol Riset Lapangan 01"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-wider text-[#73796d]">
              {t.languageToggle}:
            </span>
            <div className="inline-flex rounded-full border border-[#62765e]/25 bg-white/60 p-1">
              <button
                type="button"
                onClick={() => onLanguageChange("en")}
                className={`px-3 py-1 text-xs font-semibold rounded transition-all ${
                  language === "en"
                    ? "bg-[#344a37] text-white shadow-sm"
                    : "text-[#667163] hover:text-[#26352b]"
                }`}
                aria-pressed={language === "en"}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange("id")}
                className={`px-3 py-1 text-xs font-semibold rounded transition-all ${
                  language === "id"
                    ? "bg-[#344a37] text-white shadow-sm"
                    : "text-[#667163] hover:text-[#26352b]"
                }`}
                aria-pressed={language === "id"}
              >
                Bahasa Indonesia
              </button>
            </div>
          </div>
        </div>

        {/* Hero Narrative & 3D Focal Grid */}
        <div className="grid grid-cols-1 items-center gap-10 pt-10 md:pt-14 lg:grid-cols-12 lg:gap-12">
          {/* Left Column: Headlines & Call to Actions */}
          <div className="flex flex-col justify-center lg:col-span-5">
            <div className="inline-flex items-center gap-2 mb-4">
              <span className="h-2 w-2 rounded-full bg-[#c96c4c]" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#6a765f] sm:text-xs">
                {t.eyebrow}
              </span>
            </div>

            <h1 className="mb-6 max-w-[11ch] font-serif text-5xl font-normal leading-[.96] tracking-[-0.045em] text-[#26352b] sm:text-6xl md:text-6xl lg:text-[4.8rem]">
              {t.heroTitlePrefix}{" "}
              <em className="font-normal not-italic text-[#bf6445]">
                {t.heroTitleEmphasis}
              </em>
            </h1>

            <p className="mb-8 max-w-lg font-sans text-base font-light leading-relaxed text-[#5e685c] sm:text-lg">
              {t.heroSubtitle}
            </p>

            {/* Micro Feature Tags */}
            <div className="mb-9 flex flex-wrap gap-2.5">
              <span className="inline-flex items-center rounded-full border border-[#687a5f]/20 bg-white/55 px-3 py-1.5 text-xs font-medium text-[#485947]">
                ✓ {t.heroPill1}
              </span>
              <span className="inline-flex items-center rounded-full border border-[#687a5f]/20 bg-white/55 px-3 py-1.5 text-xs font-medium text-[#485947]">
                ✓ {t.heroPill2}
              </span>
              <span className="inline-flex items-center rounded-full border border-[#687a5f]/20 bg-white/55 px-3 py-1.5 text-xs font-medium text-[#485947]">
                ✓ {t.heroPill3}
              </span>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <button
                type="button"
                onClick={onStartVisit}
                className="group inline-flex min-h-14 items-center justify-center gap-4 rounded-full bg-[#344a37] px-7 py-4 text-sm font-semibold tracking-wide text-white shadow-lg shadow-[#344a37]/15 transition-all hover:bg-[#263a2b] active:scale-[0.99]"
              >
                <span>{t.heroCtaPrimary}</span>
                <span className="text-base transition-transform group-hover:translate-y-1">↓</span>
              </button>

              <a
                href="#discovery-narrative"
                className="inline-flex items-center gap-2 px-2 py-3 text-xs font-semibold uppercase tracking-wider text-[#556552] transition-colors hover:text-[#bf6445] sm:text-sm"
              >
                <span>{t.heroCtaSecondary}</span>
                <span>→</span>
              </a>
            </div>
          </div>

          {/* Right Column: 3D Living Business Landscape */}
          <div className="w-full lg:col-span-7">
            <BusinessLandscapeCanvas language={language} />
          </div>
        </div>
      </div>
    </section>
  );
}
