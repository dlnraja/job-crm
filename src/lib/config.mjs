export function isFirebaseConfigured(config) {
  if (!config || typeof config !== "object") return false;
  for (const key of ["apiKey", "authDomain", "projectId", "appId"]) {
    const value = config[key];
    if (typeof value !== "string" || !value.trim()) return false;
    if (/YOUR_|changeme|placeholder/i.test(value)) return false;
  }
  return true;
}

export function isGoogleClientConfigured(config) {
  const id = config?.clientId;
  return typeof id === "string" && id.trim().endsWith(".apps.googleusercontent.com");
}
