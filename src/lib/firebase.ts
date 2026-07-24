import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, type Auth } from 'firebase/auth';
import { FIREBASE_CONFIG, GOOGLE_OAUTH_CLIENT_ID } from '../config';

export interface GoogleResult {
  uid:         string;
  email:       string | null;
  displayName: string | null;
  photoURL:    string | null;
}

// Tracks whether Firebase initialized successfully. App.tsx reads this
// to decide whether to fall back to demo mode automatically.
export const firebaseAvailable: boolean = (() => {
  try {
    const cfg = FIREBASE_CONFIG;
    if (!cfg.apiKey || !cfg.appId) return false;
    return true;
  } catch {
    return false;
  }
})();

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

try {
  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
} catch (e) {
  console.error('[SENTRA] Firebase init failed — using mock:', e);
  app = null;
  auth = null;
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  client_id: GOOGLE_OAUTH_CLIENT_ID,
  prompt:    'select_account',
});

/**
 * Opens a popup — resolves on the SAME page load with the user object.
 * No redirect, no page reload, no re-render loop.
 * If Firebase is unavailable, rejects so the caller can fall back.
 */
export async function firebaseGoogleSignIn(): Promise<GoogleResult> {
  if (!auth) {
    throw new Error('Firebase no inicializado — auth no disponible');
  }
  const result = await signInWithPopup(auth, googleProvider);
  const { uid, email, displayName, photoURL } = result.user;
  return { uid, email, displayName, photoURL };
}
