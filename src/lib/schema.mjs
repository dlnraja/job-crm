const ARRAYS = ["companies", "contacts", "applications", "followUps", "emailSamples", "bouncedPatterns"];

export function assertCrm(data) {
  if (!data || data.schemaVersion !== 1) throw new Error("schema");
  if (!data.auth || typeof data.auth.username !== "string" || !data.auth.username.trim()) {
    throw new Error("schema");
  }
  for (const key of ARRAYS) {
    if (!Array.isArray(data[key])) throw new Error("schema");
  }
  return data;
}
