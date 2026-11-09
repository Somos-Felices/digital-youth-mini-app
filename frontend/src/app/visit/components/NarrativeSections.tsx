"use client";

import { useState } from "react";
import type { Language } from "../types";
import { translations } from "../translations";

interface NarrativeSectionsProps {
  language: Language;
}

export function NarrativeSections({ language }: NarrativeSectionsProps) {
  const t = translations[language];
  const [activeLensId, setActiveLensId] = useState<string>("whatsapp");
  const [viewMode, setViewMode] = useState<"surface" | "reality">("reality");

  const currentLens =
    t.sectionB.lenses.find((lens) => lens.id === activeLensId) ??
    t.sectionB.lenses[0];

  return (
    <div id="discovery-narrative" className="w-full bg-[#f2efe6] text-[#26352b]">
      {/* ---------------- SECTION A: EVERY BUSINESS HAS A STORY ---------------- */}
      <section className="py-20 md:py-28 border-b border-[#75856c]/20 max-w-[1440px] mx-auto px-5 sm:px-8 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          <div className="lg:col-span-5">
            <span className="text-[11px] font-mono tracking-[0.25em] uppercase text-[#bd6448] block mb-3">
              {t.sectionA.eyebrow}
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal leading-tight text-[#26352b] mb-6">
              {t.sectionA.title}
            </h2>
            <p className="text-base sm:text-lg text-[#bd6448] font-light leading-relaxed">
              {t.sectionA.lead}
            </p>
          </div>

          <div className="lg:col-span-7 flex flex-col justify-between">
            <div className="space-y-6 text-[#596456] leading-relaxed text-sm sm:text-base font-light mb-12">
              <p>{t.sectionA.description1}</p>
              <p>{t.sectionA.description2}</p>
            </div>

            {/* Empirical stats / Reality indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-[#75856c]/20">
              <div className="p-4 rounded-xl bg-[#e7e7dc] border border-[#75856c]/25">
                <span className="block font-serif text-3xl sm:text-4xl text-[#bd6448] font-normal mb-1">
                  {t.sectionA.stat1Number}
                </span>
                <span className="text-xs text-[#687263] leading-snug block">
                  {t.sectionA.stat1Label}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#e7e7dc] border border-[#75856c]/25">
                <span className="block font-serif text-3xl sm:text-4xl text-[#bd6448] font-normal mb-1">
                  {t.sectionA.stat2Number}
                </span>
                <span className="text-xs text-[#687263] leading-snug block">
                  {t.sectionA.stat2Label}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#e7e7dc] border border-[#75856c]/25">
                <span className="block font-serif text-3xl sm:text-4xl text-[#bd6448] font-normal mb-1">
                  {t.sectionA.stat3Number}
                </span>
                <span className="text-xs text-[#687263] leading-snug block">
                  {t.sectionA.stat3Label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- SECTION B: LOOK CLOSER (INTERACTIVE OPERATIONAL LENSES) ---------------- */}
      <section className="py-20 md:py-28 border-b border-[#75856c]/20 bg-[#e6e8dc]">
        <div className="max-w-[1440px] mx-auto px-5 sm:px-8 md:px-12">
          <div className="max-w-2xl mb-12">
            <span className="text-[11px] font-mono tracking-[0.25em] uppercase text-[#bd6448] block mb-3">
              {t.sectionB.eyebrow}
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal leading-tight text-[#26352b] mb-4">
              {t.sectionB.title}
            </h2>
            <p className="text-sm sm:text-base text-[#596456] font-light">
              {t.sectionB.subtitle}
            </p>
          </div>

          {/* Interactive Lenses Component */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Selector Column: Lens Selection Tabs */}
            <div className="lg:col-span-5 space-y-3">
              {t.sectionB.lenses.map((lens) => {
                const isSelected = lens.id === activeLensId;
                return (
                  <button
                    key={lens.id}
                    type="button"
                    onClick={() => setActiveLensId(lens.id)}
                    className={`w-full text-left p-5 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-[#dfe4d8] border-[#bd6448] shadow-lg shadow-[#75856c]/10 translate-x-1"
                        : "bg-[#f5f2e9] border-[#75856c]/20 hover:border-[#75856c]/40 text-[#687263]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono tracking-widest uppercase text-[#bd6448]">
                        {lens.tag}
                      </span>
                      <span
                        className={`text-xs ${
                          isSelected ? "text-[#bd6448]" : "text-[#7b6347]"
                        }`}
                      >
                        {isSelected ? t.activeLens : t.inspectLens}
                      </span>
                    </div>
                    <h3 className="font-serif text-lg sm:text-xl text-[#26352b] font-normal">
                      {lens.title}
                    </h3>
                  </button>
                );
              })}
            </div>

            {/* Right Detailed Inspector Panel with Surface vs Reality Toggle */}
            <div className="lg:col-span-7 p-6 sm:p-8 rounded-2xl bg-[#e7e7dc] border border-[#75856c]/30 shadow-2xl relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#75856c]/20">
                <div>
                  <span className="text-[10px] font-mono tracking-widest uppercase text-[#75856c]">
                    {currentLens.tag} · {t.operationalCheck}
                  </span>
                  <h4 className="font-serif text-2xl sm:text-3xl font-normal text-[#26352b] mt-1">
                    {currentLens.title}
                  </h4>
                </div>

                {/* Perspective Toggle Switch */}
                <div className="inline-flex rounded-lg p-1 bg-[#f5f2e9] border border-[#75856c]/30">
                  <button
                    type="button"
                    onClick={() => setViewMode("surface")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                      viewMode === "surface"
                        ? "bg-[#dce3d8] text-[#26352b] shadow-sm"
                        : "text-[#687263] hover:text-[#26352b]"
                    }`}
                  >
                    {t.sectionB.toggleViewSurface}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("reality")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                      viewMode === "reality"
                        ? "bg-[#bd6448] text-[#f2efe6] shadow-sm"
                        : "text-[#687263] hover:text-[#26352b]"
                    }`}
                  >
                    {t.sectionB.toggleViewReality}
                  </button>
                </div>
              </div>

              {/* View Content Display */}
              <div className="py-8">
                {viewMode === "surface" ? (
                  <div className="p-6 rounded-xl bg-[#f5f2e9] border border-[#75856c]/20 animate-fadeIn">
                    <span className="inline-block px-2.5 py-1 rounded text-[11px] font-mono uppercase bg-[#f5f2e9] text-[#687263] mb-3">
                      {t.surfaceCaption}
                    </span>
                    <p className="text-base sm:text-lg text-[#3d493e] leading-relaxed font-light">
                      {currentLens.surface}
                    </p>
                  </div>
                ) : (
                  <div className="p-6 rounded-xl bg-[#e4e5d9] border border-[#bd6448]/50 shadow-inner animate-fadeIn">
                    <span className="inline-block px-2.5 py-1 rounded text-[11px] font-mono uppercase bg-[#f5f2e9] text-[#bd6448] mb-3">
                      {t.realityCaption}
                    </span>
                    <p className="text-base sm:text-lg text-[#26352b] leading-relaxed font-light">
                      {currentLens.reality}
                    </p>
                  </div>
                )}
              </div>

              {/* Verified Focal Points */}
              <div className="pt-6 border-t border-[#75856c]/20">
                <span className="text-[11px] font-mono tracking-wider uppercase text-[#75856c] block mb-3">
                  {t.examplesLabel}
                </span>
                <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {currentLens.focalPoints.map((point, index) => (
                    <li
                      key={index}
                      className="p-3 rounded-lg bg-[#f5f2e9] border border-[#75856c]/15 text-xs text-[#596456] leading-snug flex items-start gap-2"
                    >
                      <span className="text-[#bd6448] font-mono text-xs">0{index + 1}.</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- SECTION C: LISTEN BEFORE SUGGESTING ---------------- */}
      <section className="py-20 md:py-28 border-b border-[#75856c]/20 max-w-[1440px] mx-auto px-5 sm:px-8 md:px-12">
        <div className="max-w-3xl mb-16">
          <span className="text-[11px] font-mono tracking-[0.25em] uppercase text-[#bd6448] block mb-3">
            {t.sectionC.eyebrow}
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal leading-tight text-[#26352b] mb-4">
            {t.sectionC.title}
          </h2>
          <p className="text-base sm:text-lg text-[#596456] font-light leading-relaxed">
            {t.sectionC.lead}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {t.sectionC.pillars.map((pillar) => (
            <div
              key={pillar.num}
              className="p-6 rounded-2xl bg-[#e7e7dc] border border-[#75856c]/25 flex flex-col justify-between hover:border-[#bd6448]/60 transition-colors"
            >
              <div>
                <span className="font-serif text-3xl text-[#bd6448] font-normal block mb-4">
                  {pillar.num}
                </span>
                <h3 className="font-serif text-xl text-[#26352b] font-normal mb-3">
                  {pillar.title}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-[#687263] leading-relaxed font-light">
                {pillar.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- SECTION D: COMMUNITY-FIRST FIELD VISIT ---------------- */}
      <section className="py-20 md:py-28 border-b border-[#75856c]/20 bg-[#e6e8dc]">
        <div className="max-w-[1440px] mx-auto px-5 sm:px-8 md:px-12">
          <div className="max-w-2xl mb-16">
            <span className="text-[11px] font-mono tracking-[0.25em] uppercase text-[#bd6448] block mb-3">
              {t.sectionD.eyebrow}
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal leading-tight text-[#26352b] mb-4">
              {t.sectionD.title}
            </h2>
            <p className="text-base text-[#596456] font-light">
              {t.sectionD.lead}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {t.sectionD.steps.map((step) => (
              <div
                key={step.step}
                className="p-6 rounded-2xl bg-[#1a1715] border border-[#75856c]/20 relative"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="w-8 h-8 rounded-full bg-[#2a241f] border border-[#75856c]/40 text-[#bd6448] font-mono text-xs flex items-center justify-center font-bold">
                    {step.step}
                  </span>
                  <span className="text-[10px] font-mono tracking-widest uppercase text-[#7b6347]">
                    {t.fieldStep}
                  </span>
                </div>
                <h3 className="font-serif text-lg text-[#26352b] font-normal mb-2">
                  {step.heading}
                </h3>
                <p className="text-xs text-[#687263] leading-relaxed font-light">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
