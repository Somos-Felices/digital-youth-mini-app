export function getSessionCookieOptions(nodeEnv: string) {
  const production = nodeEnv === "production";
  return {
    httpOnly: true,
    secure: production,
    // Vercel frontend and API hosting commonly use different sites.
    sameSite: production ? "none" as const : "lax" as const,
    path: "/api"
  };
}
