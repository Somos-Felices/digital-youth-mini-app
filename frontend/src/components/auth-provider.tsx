"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { request } from "@/lib/api";
import type { Admin } from "@/lib/types";
type AuthState = { admin: Admin | null; csrf: string | null; loading: boolean; refresh: () => Promise<void>; setSession: (admin: Admin, csrf: string) => void; clear: () => void; token: () => Promise<string> };
const Auth = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
 const [admin,setAdmin]=useState<Admin|null>(null),[csrf,setCsrf]=useState<string|null>(null),[loading,setLoading]=useState(true);
 const sessionRevision=useRef(0);
 const refresh=async()=>{const revision=sessionRevision.current;try {const me=await request<{admin:Admin}>("/api/auth/me");if(revision===sessionRevision.current)setAdmin(me.admin);}catch{if(revision===sessionRevision.current){setAdmin(null);setCsrf(null);}}finally{if(revision===sessionRevision.current)setLoading(false);}};
 useEffect(()=>{void refresh();},[]);
 const token=async(force=false)=>{if(csrf&&!force)return csrf;const r=await request<{csrfToken:string}>("/api/auth/csrf");setCsrf(r.csrfToken);return r.csrfToken;};
 return <Auth.Provider value={{admin,csrf,loading,refresh,setSession:(a,c)=>{sessionRevision.current++;setAdmin(a);setCsrf(c);setLoading(false);},clear:()=>{sessionRevision.current++;setAdmin(null);setCsrf(null);},token}}>{children}</Auth.Provider>;
}
export function useAuth(){const value=useContext(Auth);if(!value)throw new Error("AuthProvider is missing");return value;}
