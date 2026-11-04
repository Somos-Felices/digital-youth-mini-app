"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Footer, Header } from "@/components/chrome";
import { request, readableError } from "@/lib/api";

type Language = "en" | "id";

type VisitForm = {
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
};

const initialForm: VisitForm = {
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

const DRAFT_KEY = "digital-youth-business-visit-draft-v1";

const translations = {
  en: {
    eyebrow: "COMMUNITY BUSINESS VISIT",
    title: "Understand the business. Start by listening.",
    intro: "A short conversation with a local business owner. Complete this together on your phone. There are no right or wrong answers.",
    language: "Language",
    location: "Visit location",
    participant: "Your name",
    business: "Business name",
    type: "What kind of business is it?",
    toolsTitle: "1. What tools does the business currently use?",
    toolsHint: "Select all that apply.",
    problemsTitle: "2. Where does the business face difficulties?",
    problemsHint: "Select all that apply.",
    painTitle: "3. What takes the most time or causes the business to lose customers?",
    painHint: "Describe the problem in the owner's own words.",
    frequencyTitle: "4. How often does this problem happen?",
    frequency: ["Daily", "Weekly", "Monthly", "Occasionally", "Not sure"],
    contactTitle: "Optional follow-up",
    contactHint: "May we contact the business to follow up on what we discussed?",
    consent: "The business owner agrees to be contacted about this visit.",
    contactName: "Contact person's name",
    whatsapp: "WhatsApp number",
    submit: "Save visit",
    saving: "Saving...",
    saved: "Visit saved successfully.",
    offline: "You're offline. Your draft is saved on this phone. Reconnect and press Save visit to submit it.",
    error: "Could not save the visit.",
    required: "Please complete all required fields and select at least one tool and one problem area.",
    tools: ["WhatsApp", "Paper records", "Spreadsheets", "POS system", "None", "Other"],
    problems: ["Replying to tourists", "Social media", "Bookings and reservations", "Translation", "Other"],
    footer: "Your answers help us understand real business needs. We do not promise results or share contact details without consent.",
    back: "Back to Digital Youth",
  },
  id: {
    eyebrow: "KUNJUNGAN USAHA KOMUNITAS",
    title: "Pahami usaha. Mulailah dengan mendengarkan.",
    intro: "Percakapan singkat dengan pemilik usaha lokal. Isi formulir ini bersama-sama melalui ponsel. Tidak ada jawaban benar atau salah.",
    language: "Bahasa",
    location: "Lokasi kunjungan",
    participant: "Nama Anda",
    business: "Nama usaha",
    type: "Apa jenis usahanya?",
    toolsTitle: "1. Alat apa yang saat ini digunakan usaha ini?",
    toolsHint: "Pilih semua yang sesuai.",
    problemsTitle: "2. Di bagian mana usaha ini mengalami kesulitan?",
    problemsHint: "Pilih semua yang sesuai.",
    painTitle: "3. Apa yang paling banyak menyita waktu atau menyebabkan kehilangan pelanggan?",
    painHint: "Jelaskan masalah dengan kata-kata pemilik usaha sendiri.",
    frequencyTitle: "4. Seberapa sering masalah ini terjadi?",
    frequency: ["Setiap hari", "Setiap minggu", "Setiap bulan", "Sesekali", "Tidak yakin"],
    contactTitle: "Tindak lanjut (opsional)",
    contactHint: "Bolehkah kami menghubungi usaha ini untuk menindaklanjuti percakapan?",
    consent: "Pemilik usaha setuju untuk dihubungi mengenai kunjungan ini.",
    contactName: "Nama orang yang dapat dihubungi",
    whatsapp: "Nomor WhatsApp",
    submit: "Simpan kunjungan",
    saving: "Menyimpan...",
    saved: "Kunjungan berhasil disimpan.",
    offline: "Anda sedang offline. Draf tersimpan di ponsel ini. Sambungkan kembali ke internet lalu tekan Simpan kunjungan.",
    error: "Kunjungan tidak dapat disimpan.",
    required: "Lengkapi semua kolom wajib serta pilih minimal satu alat dan satu area masalah.",
    tools: ["WhatsApp", "Catatan kertas", "Spreadsheet", "Sistem POS", "Tidak ada", "Lainnya"],
    problems: ["Membalas wisatawan", "Media sosial", "Pemesanan dan reservasi", "Penerjemahan", "Lainnya"],
    footer: "Jawaban Anda membantu kami memahami kebutuhan usaha yang nyata. Kami tidak menjanjikan hasil atau membagikan informasi kontak tanpa persetujuan.",
    back: "Kembali ke Digital Youth",
  },
};

const toolValues = ["whatsapp", "paper_records", "spreadsheets", "pos_system", "none", "other"];
const problemValues = ["tourist_replies", "social_media", "bookings", "translation", "other"];
const frequencyValues = ["daily", "weekly", "monthly", "occasionally", "unsure"];

export default function VisitPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [form, setForm] = useState<VisitForm>(initialForm);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const t = translations[language];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<VisitForm>;
        setForm({ ...initialForm, ...parsed });
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }
  }, [form, hydrated]);

  function update<K extends keyof VisitForm>(key: K, value: VisitForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setMessage("");
    setError("");
  }

  function toggleItem(key: "currentTools" | "problemAreas", value: string) {
    const current = form[key];
    if (key === "currentTools" && value === "none") {
      update(key, current.includes("none") ? [] : ["none"]);
      return;
    }
    const next = current.filter((item) => item !== "none");
    update(key, next.includes(value) ? next.filter((item) => item !== value) : [...next, value]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (
      !form.currentTools.length ||
      !form.problemAreas.length ||
      !form.painFrequency ||
      (form.followUpConsent && (!form.contactName.trim() || !form.contactValue.trim()))
    ) {
      setError(t.required);
      return;
    }

    if (!navigator.onLine) {
      setMessage(t.offline);
      return;
    }

    setSaving(true);
    try {
      await request("/api/diagnostic-submissions", {
        method: "POST",
        body: JSON.stringify({
          pilotLocation: form.pilotLocation,
          participantName: form.participantName,
          businessName: form.businessName,
          businessType: form.businessType,
          currentTools: form.currentTools,
          problemAreas: form.problemAreas,
          biggestOperationalPain: form.biggestOperationalPain,
          painFrequency: form.painFrequency,
          willingnessToPay: "unsure",
          budgetAmount: null,
          budgetCurrency: null,
          followUpConsent: form.followUpConsent,
          contactName: form.followUpConsent ? form.contactName : null,
          contactMethod: form.followUpConsent ? "whatsapp" : null,
          contactValue: form.followUpConsent ? form.contactValue : null,
        }),
      });

      localStorage.removeItem(DRAFT_KEY);
      setForm(initialForm);
      setMessage(t.saved);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header />
      <main className="section-wrap">
        <section className="page-intro">
          <div className="eyebrow">{t.eyebrow}</div>
          <h1>{t.title}</h1>
          <p className="muted">{t.intro}</p>
          <div className="form-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <a className="text-link" href="/">{t.back}</a>
            <label className="field" style={{ maxWidth: 190 }}>
              <span>{t.language}</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="en">English</option>
                <option value="id">Bahasa Indonesia</option>
              </select>
            </label>
          </div>
        </section>

        <form className="form-shell" onSubmit={handleSubmit}>
          <section className="form-section">
            <h2>{language === "en" ? "Visit details" : "Detail kunjungan"}</h2>
            <div className="fields">
              <label className="field">
                <span>{t.location}</span>
                <input required minLength={2} maxLength={100} value={form.pilotLocation} onChange={(e) => update("pilotLocation", e.target.value)} />
              </label>
              <label className="field">
                <span>{t.participant}</span>
                <input required minLength={2} maxLength={120} value={form.participantName} onChange={(e) => update("participantName", e.target.value)} />
              </label>
              <label className="field">
                <span>{t.business}</span>
                <input required minLength={2} maxLength={160} value={form.businessName} onChange={(e) => update("businessName", e.target.value)} />
              </label>
              <label className="field">
                <span>{t.type}</span>
                <input required minLength={2} maxLength={100} value={form.businessType} onChange={(e) => update("businessType", e.target.value)} placeholder={language === "en" ? "e.g. Cafe, homestay, tour operator" : "mis. Kafe, homestay, operator tur"} />
              </label>
            </div>
          </section>

          <section className="form-section">
            <h2>{t.toolsTitle}</h2>
            <p className="muted">{t.toolsHint}</p>
            <div className="checks">
              {toolValues.map((value, index) => (
                <label className="check-option" key={value}>
                  <input type="checkbox" checked={form.currentTools.includes(value)} onChange={() => toggleItem("currentTools", value)} />
                  <span>{t.tools[index]}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="form-section">
            <h2>{t.problemsTitle}</h2>
            <p className="muted">{t.problemsHint}</p>
            <div className="checks">
              {problemValues.map((value, index) => (
                <label className="check-option" key={value}>
                  <input type="checkbox" checked={form.problemAreas.includes(value)} onChange={() => toggleItem("problemAreas", value)} />
                  <span>{t.problems[index]}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="form-section">
            <h2>{t.painTitle}</h2>
            <p className="muted">{t.painHint}</p>
            <label className="field">
              <textarea required minLength={10} maxLength={2000} rows={5} value={form.biggestOperationalPain} onChange={(e) => update("biggestOperationalPain", e.target.value)} />
            </label>
          </section>

          <section className="form-section">
            <h2>{t.frequencyTitle}</h2>
            <div className="checks">
              {frequencyValues.map((value, index) => (
                <label className="check-option" key={value}>
                  <input type="radio" name="painFrequency" required checked={form.painFrequency === value} onChange={() => update("painFrequency", value)} />
                  <span>{t.frequency[index]}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="form-section">
            <h2>{t.contactTitle}</h2>
            <p className="muted">{t.contactHint}</p>
            <label className="consent">
              <input type="checkbox" checked={form.followUpConsent} onChange={(e) => update("followUpConsent", e.target.checked)} />
              <span>{t.consent}</span>
            </label>
            {form.followUpConsent && (
              <div className="fields">
                <label className="field">
                  <span>{t.contactName}</span>
                  <input required value={form.contactName} onChange={(e) => update("contactName", e.target.value)} maxLength={120} />
                </label>
                <label className="field">
                  <span>{t.whatsapp}</span>
                  <input required type="tel" value={form.contactValue} onChange={(e) => update("contactValue", e.target.value)} maxLength={190} placeholder="+62..." />
                </label>
              </div>
            )}
          </section>

          {error && <p role="alert" className="error-message">{error}</p>}
          {message && <p role="status" className="success-panel">{message}</p>}

          <div className="form-actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? t.saving : t.submit}
            </button>
            <span className="muted">{t.footer}</span>
          </div>
        </form>
      </main>
      <Footer />
    </>
  );
}
