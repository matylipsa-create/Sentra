import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBvG37kX92pQ_m8L4v93b7X1z92_Bc",
  authDomain: "sentra-security-system.firebaseapp.com",
  projectId: "sentra-security-system",
  storageBucket: "sentra-security-system.firebasestorage.app",
  messagingSenderId: "105312015243",
  appId: "1:105312015243:web:757e84bf9a8972109677e5",
  measurementId: "G-F65H5NMYZ9"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Kept for SentraAuth.tsx compatibility
export const firebaseAuth = auth;

function isMobile(): boolean {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

export async function firebaseGoogleSignIn(): Promise<{
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}> {
  if (isMobile()) {
    await signInWithRedirect(auth, googleProvider);
    return new Promise(() => {});
  }
  const result = await signInWithPopup(auth, googleProvider);
  const { uid, email, displayName, photoURL } = result.user;
  return { uid, email, displayName, photoURL };
}

export async function checkRedirectResult(): Promise<{
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
} | null> {
  try {
    const result = await getRedirectResult(auth);
    if (!result) return null;
    const { uid, email, displayName, photoURL } = result.user;
    return { uid, email, displayName, photoURL };
  } catch (err) {
    console.error('[SENTRA] Firebase redirect result error:', err);
    return null;
  }
}
