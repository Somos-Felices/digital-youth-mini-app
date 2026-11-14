import { useEffect, useState, type ReactNode } from "react";
import { diagnosticRepository, type Diagnostic } from "./diagnostics";
import { copy, type Language } from "./diagnostic-copy";
import { remoteSubmissionEnabled, sendFieldVisitDiagnostic, toFieldVisitPayload } from "./api";

const empty: Diagnostic = { businessName: "", businessType: "", businessTypeOther: "", tools: [], toolsOther: "", problemAreas: [], pain: "", contactName: "", whatsapp: "", consent: false };


// Bilingual first-time user guide for the five-step business diagnostic.
function UserGuide({ lang, onClose }: { lang: Language; onClose: () => void }) {
  const en = {
    title: "How to use this form", intro: "A simple guide to completing your business visit.", close: "Close guide",
    steps: [
      ["1","Business details","Enter the business name and choose the type that best describes it. If you choose Other, specify the type."],
      ["2","Current tools","Select every tool the business currently uses. Choose Nothing if no tools are used, or Other to specify another tool."],
      ["3","Daily challenges","Describe what takes the most time or makes serving customers difficult. A short, honest example is enough."],
      ["4","Problem areas","Select every area that feels difficult, such as customer replies, social media, bookings or translation."],
      ["5","Contact (optional)","You can leave your name and WhatsApp number blank. If you enter a number, tick the consent box before submitting."]
    ],
    tipsTitle: "Helpful tips",
    tips: ["Use Continue to move forward and Back to review an earlier step.","Your draft is saved on this device as you go. Return using the same browser and device.","Do not enter passwords, private messages, customer records or payment details.","After submitting, wait for confirmation. If sending fails, check your connection and use Retry submission."]
  };
  const id = {
    title: "Cara menggunakan formulir ini", intro: "Panduan singkat untuk menyelesaikan kunjungan usaha.", close: "Tutup panduan",
    steps: [
      ["1","Informasi usaha","Masukkan nama usaha dan pilih jenis yang paling sesuai. Jika memilih Lainnya, jelaskan jenis usahanya."],
      ["2","Alat yang digunakan","Pilih semua alat yang saat ini digunakan. Pilih Belum menggunakan alat apa pun jika memang tidak ada, atau Lainnya untuk menyebutkan alat lain."],
      ["3","Tantangan sehari-hari","Ceritakan pekerjaan yang paling menyita waktu atau menyulitkan pelayanan pelanggan. Contoh singkat dan jujur sudah cukup."],
      ["4","Bidang masalah","Pilih semua bidang yang terasa sulit, seperti membalas pelanggan, media sosial, pemesanan, atau terjemahan."],
      ["5","Kontak (opsional)","Nama dan nomor WhatsApp boleh dikosongkan. Jika mengisi nomor, centang persetujuan sebelum mengirim."]
    ],
    tipsTitle: "Beberapa tips",
    tips: ["Gunakan Lanjutkan untuk ke langkah berikutnya dan Kembali untuk meninjau langkah sebelumnya.","Draf tersimpan di perangkat ini selama Anda mengisi. Lanjutkan dengan browser dan perangkat yang sama.","Jangan masukkan kata sandi, pesan pribadi, data pelanggan, atau detail pembayaran.","Setelah mengirim, tunggu konfirmasi. Jika gagal, periksa koneksi lalu pilih Coba kirim lagi."]
  };
  const t = lang === "en" ? en : id;
  return <div className="guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="guide-heading"><div><p className="eyebrow">DIGITAL YOUTH</p><h2 id="guide-title">{t.title}</h2><p>{t.intro}</p></div><button type="button" className="guide-close" onClick={onClose} aria-label={t.close}><span className="guide-close-icon" aria-hidden="true" /></button></div>
      <ol className="guide-steps">{t.steps.map(([number,title,body]) => <li key={number}><span className="guide-number">{number}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
      <div className="guide-tips"><h3>{t.tipsTitle}</h3><ul>{t.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul></div>
      <button type="button" className="primary-button guide-done" onClick={onClose}>{t.close}</button>
    </section>
  </div>;
}
export function App() {
  const [lang, setLang] = useState<Language>(() => localStorage.getItem("local-digital-language") === "en" ? "en" : "id");
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Diagnostic>(empty);
  const [submissionUuid, setSubmissionUuid] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const t = copy[lang];

  useEffect(() => { document.documentElement.lang = lang; localStorage.setItem("local-digital-language", lang); }, [lang]);
  useEffect(() => { void diagnosticRepository.loadDraft().then(async (draft) => { if (draft) { setData({ ...empty, ...draft }); setStep(Math.max(1, Math.min(5, draft.step))); setSubmissionUuid(draft.submissionUuid ?? ""); if (draft.submissionUuid && remoteSubmissionEnabled) { const status = await diagnosticRepository.getSubmissionStatus(draft.submissionUuid); setSaveError(status === "pending" || status === "failed"); } } }).catch(() => setSaveError(true)).finally(() => setReady(true)); }, []);
  useEffect(() => { if (!ready || done) return; const timer = window.setTimeout(() => { void diagnosticRepository.saveDraft({ ...data, step, submissionUuid }).catch(() => setSaveError(true)); }, 250); return () => window.clearTimeout(timer); }, [data, step, submissionUuid, ready, done]);

  function update<K extends keyof Diagnostic>(key: K, value: Diagnostic[K]) { editedAfterFailure(); setData((old) => ({ ...old, [key]: value })); setErrors([]); }
  function editedAfterFailure() { if (saveError) { setSubmissionUuid(""); setSaveError(false); } }
  function changeLanguage(next: Language) {
    if (next === lang) return;
    const from = copy[lang]; const to = copy[next];
    const translate = (value: string, source: readonly string[], target: readonly string[]) => { const i = source.indexOf(value); return i < 0 ? value : target[i] ?? value; };
    setData((old) => ({ ...old, businessType: translate(old.businessType, from.categories, to.categories), tools: old.tools.map((x) => translate(x, from.tools, to.tools)), problemAreas: old.problemAreas.map((x) => translate(x, from.problemAreas, to.problemAreas)) }));
    setLang(next); setErrors([]);
  }
  function toggleTool(tool: string) {
    editedAfterFailure();
    setData((old) => {
      if (tool === t.tools[3]) return { ...old, tools: old.tools.includes(tool) ? [] : [tool] };
      const next = old.tools.includes(tool) ? old.tools.filter((x) => x !== tool) : [...old.tools.filter((x) => x !== t.tools[3]), tool];
      return { ...old, tools: next };
    }); setErrors([]);
  }
  function validate(): boolean {
    const issues: string[] = [];
    if (step === 1) { if (!data.businessName.trim()) issues.push("businessName"); if (!data.businessType) issues.push("businessType"); if (data.businessType === t.categories[4] && !data.businessTypeOther.trim()) issues.push("businessTypeOther"); }
    if (step === 2) { if (!data.tools.length) issues.push("tools"); if (data.tools.includes(t.tools[4]) && !data.toolsOther.trim()) issues.push("toolsOther"); }
    if (step === 3 && !data.pain.trim()) issues.push("pain");
    if (step === 4 && !data.problemAreas.length) issues.push("problemAreas");
    if (step === 5 && data.whatsapp.trim() && !data.consent) issues.push("consent");
    setErrors(issues); if (issues.length) document.getElementById(issues[0])?.focus(); return !issues.length;
  }
  async function goToStep(target: number) {
    try { await diagnosticRepository.saveDraft({ ...data, step: target, submissionUuid }); }
    catch { setSaveError(true); }
    setStep(target); setErrors([]); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function next() { if (validate()) void goToStep(Math.min(5, step + 1)); }
  async function submit() {
    if (!validate() || saving) return;
    setSaving(true); setSaveError(false);
    const id = submissionUuid || crypto.randomUUID();
    setSubmissionUuid(id);
    try {
      if (!remoteSubmissionEnabled) {
        await diagnosticRepository.saveSubmission(data, id, "local_only");
        await diagnosticRepository.clearDraft().catch(() => undefined);
        setDone(true);
        return;
      }
      await diagnosticRepository.saveDraft({ ...data, step, submissionUuid: id });
      await diagnosticRepository.saveSubmission(data, id, "pending");
      try {
        const payload = toFieldVisitPayload(data, lang, id);
        await sendFieldVisitDiagnostic(payload);
        await diagnosticRepository.updateSubmissionStatus(id, "received");
        await diagnosticRepository.clearDraft().catch(() => undefined);
        setDone(true);
      } catch (error) {
        await diagnosticRepository.updateSubmissionStatus(id, "failed").catch(() => undefined);
        throw error;
      }
    } catch {
      setSaveError(true);
    } finally { setSaving(false); }
  }
  function restart() { setData(empty); setStep(1); setSubmissionUuid(""); setErrors([]); setDone(false); setSaveError(false); }
  const has = (field: string) => errors.includes(field);
  const errorText = <p className="field-error" role="alert">{t.requiredError}</p>;
  const fieldLabel = (label: string, field: string) => <label className="field-label" htmlFor={field}>{label}{has(field) && <span className="sr-only">Required: {t.requiredError}</span>}</label>;
  const choice = (label: string, selected: boolean, action: () => void, role: "radio" | "checkbox" = "radio") => <button type="button" className={`select-row ${selected ? "selected" : ""}`} role={role} aria-checked={selected} onClick={action} key={label}><span className={role === "checkbox" ? "checkbox-mark" : "radio-mark"} aria-hidden="true">{selected ? "✓" : ""}</span><span>{label}</span></button>;

  let content: ReactNode;
  if (done) content = <section className="confirmation" aria-live="polite"><div className="confirm-icon" aria-hidden="true">✓</div><h1>{remoteSubmissionEnabled ? t.receivedTitle : t.savedTitle}</h1><p>{remoteSubmissionEnabled ? t.receivedBody : t.savedBody}</p>{!remoteSubmissionEnabled && <p className="local-note">{t.localNotice}</p>}<button className="primary-button" onClick={restart}>{t.restart}</button></section>;
  else content = <>
    <div className="step-meta"><span>{t.step} {step} {t.of} 5</span><span>{Math.round(step / 5 * 100)}%</span></div>
    <div className="progress-track" role="progressbar" aria-label={`${t.step} ${step} ${t.of} 5`} aria-valuemin={1} aria-valuemax={5} aria-valuenow={step}><span style={{ width: `${step * 20}%` }} /></div>
    <section className="question-panel" key={step} aria-labelledby="question-title">
      {step === 1 && <><p className="eyebrow">{t.intro}</p><h1 id="question-title">{t.businessHeading}</h1><p className="supporting">{t.businessSupport}</p>{fieldLabel(t.businessName, "businessName")}<input id="businessName" className={has("businessName") ? "invalid" : ""} autoComplete="organization" value={data.businessName} onChange={(e) => { editedAfterFailure(); update("businessName", e.target.value); }} maxLength={140} placeholder={t.businessPlaceholder} />{has("businessName") && errorText}<fieldset className="choice-fieldset"><legend>{t.businessType}<span className="sr-only"> · {t.required}</span></legend>{t.categories.map((category) => choice(category, data.businessType === category, () => { editedAfterFailure(); update("businessType", category); }))}{has("businessType") && errorText}</fieldset>{data.businessType === t.categories[4] && <div className="conditional-field">{fieldLabel(t.specify, "businessTypeOther")}<input id="businessTypeOther" className={has("businessTypeOther") ? "invalid" : ""} value={data.businessTypeOther} onChange={(e) => { editedAfterFailure(); update("businessTypeOther", e.target.value); }} maxLength={100} />{has("businessTypeOther") && errorText}</div>}</>}
      {step === 2 && <><p className="eyebrow">{t.toolsEyebrow}</p><h1 id="question-title">{t.toolsHeading}</h1><p className="supporting">{t.toolsSupport}</p><div className="select-list" role="group" aria-label={t.toolsHeading}>{t.tools.map((tool) => choice(tool, data.tools.includes(tool), () => toggleTool(tool), "checkbox"))}</div>{has("tools") && errorText}{data.tools.includes(t.tools[4]) && <div className="conditional-field">{fieldLabel(t.specify, "toolsOther")}<input id="toolsOther" className={has("toolsOther") ? "invalid" : ""} value={data.toolsOther} onChange={(e) => update("toolsOther", e.target.value)} maxLength={120} />{has("toolsOther") && errorText}</div>}</>}
      {step === 3 && <><p className="eyebrow">{t.painEyebrow}</p><h1 id="question-title">{t.painHeading}</h1><p className="supporting">{t.painSupport}</p><label className="sr-only" htmlFor="pain">{t.painHeading}</label><textarea id="pain" className={has("pain") ? "invalid" : ""} value={data.pain} onChange={(e) => { editedAfterFailure(); update("pain", e.target.value); }} placeholder={t.painPlaceholder} maxLength={500} rows={7} aria-describedby="pain-count"/><div className="field-foot"><span>{has("pain") && errorText}</span><span id="pain-count">{data.pain.length}/500</span></div></>}
      {step === 4 && <><p className="eyebrow">{t.problemEyebrow}</p><h1 id="question-title">{t.problemHeading}</h1><p className="supporting">{t.problemSupport}</p><div className="select-list" role="group" aria-label={t.problemHeading}>{t.problemAreas.map((area) => choice(area, data.problemAreas.includes(area), () => { editedAfterFailure(); setData((old) => ({ ...old, problemAreas: old.problemAreas.includes(area) ? old.problemAreas.filter((item) => item !== area) : [...old.problemAreas, area] })); setErrors([]); }, "checkbox"))}</div>{has("problemAreas") && errorText}</>}
      {step === 5 && <><p className="eyebrow">{t.contactEyebrow}</p><h1 id="question-title">{t.contactHeading}</h1><p className="supporting">{t.contactSupport}</p>{fieldLabel(t.name, "contactName")}<input id="contactName" autoComplete="name" value={data.contactName} onChange={(e) => { editedAfterFailure(); update("contactName", e.target.value); }} maxLength={140} placeholder={t.optionalPlaceholder}/>{fieldLabel(t.whatsapp, "whatsapp")}<input id="whatsapp" type="tel" autoComplete="tel" inputMode="tel" value={data.whatsapp} onChange={(e) => { editedAfterFailure(); const value = e.target.value; setData((old) => ({ ...old, whatsapp: value, consent: value.trim() ? old.consent : false })); setErrors([]); }} placeholder="+62 812 3456 7890" />{data.whatsapp.trim() && <label className={`consent-row ${has("consent") ? "invalid-consent" : ""}`}><input id="consent" type="checkbox" checked={data.consent} onChange={(e) => { editedAfterFailure(); update("consent", e.target.checked); }}/><span>{t.consent}</span></label>}{has("consent") && errorText}<p className="optional-note">{t.contactOptional}</p></>}
      {saveError && <p className="save-error" role="alert">{remoteSubmissionEnabled ? t.remoteError : t.saveError}</p>}
    </section>
    <div className="actions"><button className="back-button" disabled={step === 1} onClick={() => void goToStep(Math.max(1, step - 1))}>{t.back}</button>{step < 5 ? <button className="primary-button" onClick={next}>{t.continue}<span aria-hidden="true">→</span></button> : <button className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? (remoteSubmissionEnabled ? t.sending : t.saving) : saveError && remoteSubmissionEnabled ? t.retry : t.submit}</button>}</div>
  </>;

  return <div className="app-shell"><header className="site-header"><a href="/" className="site-brand"><span className="site-mark">dy</span><span>DIGITAL<br />YOUTH</span></a><nav aria-label="Main navigation"><a href="/">Home</a><a href="/business/intake">Business</a><a href="/participant">Youth</a><a href="/coordinator">Coordinator</a></nav><button className="guide-trigger" type="button" onClick={() => setShowGuide(true)}>{lang === "en" ? "How to use" : "Panduan"}</button><div className="language-switch" aria-label={t.language}><button className={lang === "id" ? "active" : ""} onClick={() => changeLanguage("id")} aria-pressed={lang === "id"}>ID</button><span aria-hidden="true">|</span><button className={lang === "en" ? "active" : ""} onClick={() => changeLanguage("en")} aria-pressed={lang === "en"}>EN</button></div></header><main className="main-content">{ready ? content : <div className="loading-state" role="status">{t.loading}</div>}</main>{showGuide && <UserGuide lang={lang} onClose={() => setShowGuide(false)} />}<footer className="footer-note">{t.footer}</footer></div>;
}

