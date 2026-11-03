const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
if (process.env.NODE_ENV === "production" && !configuredApiBase) throw new Error("NEXT_PUBLIC_API_BASE_URL must be configured for production builds.");
export const API = (configuredApiBase ?? "http://localhost:4000").replace(/\/$/, "");
export class ApiError extends Error { constructor(public status: number, message: string, public details?: unknown) { super(message); } }
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const isPrivate = path.startsWith("/api/admin") || path.startsWith("/api/auth");
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response: Response;
  try { response = await fetch(`${API}${path}`, { ...init, method, headers, credentials: init.credentials ?? (isPrivate ? "include" : "omit"), cache: init.cache ?? (isPrivate || method !== "GET" ? "no-store" : "default") }); }
  catch (error) { if (init.signal?.aborted) throw error; throw new ApiError(0, "The server could not be reached. Check your connection and try again."); }
  const isJson = (response.headers.get("content-type") ?? "").includes("json");
  const data: unknown = isJson ? await response.json().catch(() => null) : await response.text().catch(() => "");
  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : `Request failed (${response.status})`;
    const details = typeof data === "object" && data !== null && "details" in data ? data.details : undefined;
    throw new ApiError(response.status, message, details);
  }
  if (!isJson) throw new ApiError(response.status, "The server returned an unexpected response.");
  return data as T;
}
export function readableError(error: unknown) { return error instanceof ApiError ? error.message : "Something went wrong. Please try again."; }
