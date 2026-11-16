import { initializeApp, type FirebaseOptions } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { doc, getDoc, getFirestore, setDoc, type Firestore } from "firebase/firestore";

export interface FirebaseWebConfig extends FirebaseOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

let services: { auth: Auth; db: Firestore } | null = null;

export function connectFirebase(config: FirebaseWebConfig) {
  if (!services) {
    const app = initializeApp(config);
    services = { auth: getAuth(app), db: getFirestore(app) };
  }
  return services;
}

export function accountFromUser(user: User) {
  return { uid: user.uid, email: user.email ?? "" };
}

export async function signInEmail(auth: Auth, email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return accountFromUser(credential.user);
}

export async function signUpEmail(auth: Auth, email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return accountFromUser(credential.user);
}

export async function signInGoogle(auth: Auth) {
  const credential = await signInWithPopup(auth, new GoogleAuthProvider());
  return accountFromUser(credential.user);
}

export async function signOutAccount(auth: Auth) {
  await signOut(auth);
}

export async function readVault(db: Firestore, uid: string) {
  const snap = await getDoc(doc(db, "users", uid, "vault", "data"));
  if (!snap.exists()) return null;
  const data = snap.data() as { envelope?: unknown };
  return data.envelope ?? null;
}

export async function writeVault(db: Firestore, uid: string, envelope: unknown, updatedAt: string) {
  await setDoc(doc(db, "users", uid, "vault", "data"), { envelope, updatedAt });
}
