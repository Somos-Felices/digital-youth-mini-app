"use client";

import type { Language } from "../types";
import { translations } from "../translations";

interface FutureHorizonSectionProps {
  language: Language;
}

export function FutureHorizonSection({ language }: FutureHorizonSectionProps) {
  const t = translations[language];

  return (
    <section className="py-20 md:py-28 border-t border-[#75856c]/20 bg-[#f2efe6] text-[#26352b]">
      <div className="max-w-[1440px] mx-auto px-5 sm:px-8 md:px-12">
        <div className="max-w-3xl mb-16">
          <span className="text-[11px] font-mono tracking-[0.25em] uppercase text-[#bd6448] block mb-3">
            {t.sectionE.eyebrow}
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal leading-tight text-[#26352b] mb-4">
            {t.sectionE.title}
          </h2>
          <p className="text-base sm:text-lg text-[#596456] font-light leading-relaxed">
            {t.sectionE.lead}
          </p>
        </div>

        {/* Immediate Output Box */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#1e1b17] border border-[#75856c]/30 mb-16 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-2.5 h-2.5 rounded-full bg-[#789171]" />
            <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#26352b]">
              {t.sectionE.immediateOutput.title}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {t.sectionE.immediateOutput.items.map((item, index) => (
              <div
                key={index}
                className="p-5 rounded-xl bg-[#28241f] border border-[#75856c]/20 flex flex-col justify-between"
              >
                <span className="text-[11px] font-mono text-[#bd6448] mb-2">
                  0{index + 1}. {t.capturedLabel}
                </span>
                <p className="text-xs sm:text-sm text-[#3d493e] leading-relaxed">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Future Horizon: The Broader V3 Journey */}
        <div className="pt-8 border-t border-[#75856c]/20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <span className="text-[10px] font-mono tracking-widest uppercase text-[#75856c] block mb-1">
                {t.researchHorizon}
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl font-normal text-[#26352b]">
                {t.sectionE.v3Roadmap.title}
              </h3>
            </div>
            <p className="text-xs text-[#687263] max-w-md font-mono">
              * {t.sectionE.v3Roadmap.note}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {t.sectionE.v3Roadmap.steps.map((st) => {
              const isActive = st.status === "ACTIVE NOW" || st.status === "AKTIF SAAT INI";
              return (
                <div
                  key={st.phase}
                  className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                    isActive
                      ? "bg-[#282119] border-[#bd6448] shadow-lg shadow-[#bd6448]/10 ring-1 ring-[#bd6448]/40"
                      : "bg-[#f5f2e9] border-[#75856c]/15 opacity-80"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs font-bold text-[#bd6448]">
                        {st.phase}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                          isActive
                            ? "bg-[#bd6448] text-[#f2efe6]"
                            : "bg-[#25221e] text-[#687263]"
                        }`}
                      >
                        {st.status}
                      </span>
                    </div>
                    <h4 className="font-serif text-base text-[#26352b] font-normal mb-2">
                      {st.name}
                    </h4>
                  </div>
                  <p className="text-[11px] text-[#687263] leading-snug font-light mt-2">
                    {st.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
