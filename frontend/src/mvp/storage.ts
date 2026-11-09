import type { Visit, VisitInput } from "./types";

/** Local repository boundary. A remote repository can replace this in a later integration phase. */
export interface VisitRepository { all(): Promise<Visit[]>; get(id: string): Promise<Visit | undefined>; save(input: VisitInput, id?: string): Promise<Visit>; remove(id: string): Promise<void>; }
const DB = "digital-youth-visits"; const STORE = "visits";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open(DB, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void): Promise<T> {
  const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, mode); run(tx.objectStore(STORE), resolve, reject); tx.oncomplete = () => db.close(); tx.onerror = () => reject(tx.error); });
}
export const visitRepository: VisitRepository = {
  all: () => transaction<Visit[]>("readonly", (s, resolve, reject) => { const r = s.getAll(); r.onsuccess = () => resolve((r.result as Visit[]).sort((a,b) => b.createdAt.localeCompare(a.createdAt))); r.onerror = () => reject(r.error); }),
  get: (id) => transaction<Visit | undefined>("readonly", (s, resolve, reject) => { const r = s.get(id); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }),
  save: (input, id) => transaction<Visit>("readwrite", (s, resolve, reject) => { const now = new Date().toISOString(); const r = s.get(id ?? ""); r.onsuccess = () => { const previous = r.result as Visit | undefined; const record: Visit = { ...input, id: id ?? crypto.randomUUID(), createdAt: previous?.createdAt ?? now, updatedAt: now }; const put = s.put(record); put.onsuccess = () => resolve(record); put.onerror = () => reject(put.error); }; r.onerror = () => reject(r.error); }),
  remove: (id) => transaction<void>("readwrite", (s, resolve, reject) => { const r = s.delete(id); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); }),
};
