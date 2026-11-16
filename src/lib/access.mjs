/** Mirrors firestore.rules: only /users/{auth.uid}/** is readable or writable. */
export function canAccessUserPath(authUid, path) {
  if (!authUid || typeof path !== "string") return false;
  const match = /^\/?users\/([^/]+)(?:\/.*)?$/.exec(path);
  if (!match) return false;
  return match[1] === authUid;
}
