export type Diagnostic = { businessName: string; businessType: string; businessTypeOther: string; tools: string[]; toolsOther: string; pain: string; willingness: string; contactName: string; whatsapp: string; consent: boolean };
export type SubmissionStatus = "pending" | "failed" | "received" | "local_only";
type Draft = Diagnostic & { step: number; submissionUuid?: string; updatedAt: string };
type Submission = Diagnostic & { id: string; createdAt: string; status: SubmissionStatus };
const DB = "local-digital-diagnostics"; const VERSION = 1; const DRAFTS = "drafts"; const SUBMISSIONS = "submissions"; const DRAFT_ID = "active";
function openDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DB, VERSION); request.onupgradeneeded = () => { const db = request.result; db.createObjectStore(DRAFTS, { keyPath: "id" }); db.createObjectStore(SUBMISSIONS, { keyPath: "id" }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function run<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(storeName, mode); const req = action(tx.objectStore(storeName)); let result: T; req.onsuccess = () => { result = req.result; }; req.onerror = () => reject(req.error); tx.oncomplete = () => { db.close(); resolve(result); }; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted")); }); }
export const diagnosticRepository = {
  async loadDraft(): Promise<(Diagnostic & { step: number; submissionUuid?: string }) | undefined> { const value = await run<Draft | undefined>(DRAFTS, "readonly", (s) => s.get(DRAFT_ID)); if (!value) return undefined; const { id: _id, updatedAt: _updatedAt, ...draft } = value as Draft & { id: string }; return draft; },
  saveDraft(data: Diagnostic & { step: number; submissionUuid?: string }): Promise<unknown> {
    const safe = { ...data, contactName: data.consent ? data.contactName : "", whatsapp: data.consent ? data.whatsapp : "" };
    return run(DRAFTS, "readwrite", (s) => s.put({ ...safe, id: DRAFT_ID, updatedAt: new Date().toISOString() }));
  },
  async saveSubmission(data: Diagnostic, submissionUuid: string, status: SubmissionStatus): Promise<void> {
    const record: Submission = {
      ...data,
      contactName: data.consent ? data.contactName.trim() : "",
      whatsapp: data.consent ? data.whatsapp.trim() : "",
      id: submissionUuid,
      createdAt: new Date().toISOString(),
      status
    };
    await run(SUBMISSIONS, "readwrite", (s) => s.put(record));
  },
  async updateSubmissionStatus(submissionUuid: string, status: SubmissionStatus): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SUBMISSIONS, "readwrite");
      const store = tx.objectStore(SUBMISSIONS);
      const request = store.get(submissionUuid);
      request.onsuccess = () => { if (request.result) store.put({ ...request.result, status }); };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    }).finally(() => db.close());
  },
  async getSubmissionStatus(submissionUuid: string): Promise<SubmissionStatus | undefined> {
    const record = await run<Submission | undefined>(SUBMISSIONS, "readonly", (s) => s.get(submissionUuid));
    return record?.status;
  },
  clearDraft(): Promise<unknown> { return run(DRAFTS, "readwrite", (s) => s.delete(DRAFT_ID)); },
};
