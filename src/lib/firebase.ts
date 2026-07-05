import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { FIREBASE_CONFIG, GOOGLE_OAUTH_CLIENT_ID } from '../config';

// Config viene 100% de `src/config.ts` — fuente única de verdad para auth.
const app = initializeApp(FIREBASE_CONFIG);

export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  client_id: GOOGLE_OAUTH_CLIENT_ID,
  prompt:    'select_account',
});

export interface GoogleResult {
  uid:         string;
  email:       string | null;
  displayName: string | null;
  photoURL:    string | null;
}

/**
 * Opens a popup — resolves on the SAME page load with the user object.
 * No redirect, no page reload, no re-render loop.
 */
export async function firebaseGoogleSignIn(): Promise<GoogleResult> {
  const result = await signInWithPopup(auth, googleProvider);
  const { uid, email, displayName, photoURL } = result.user;
  return { uid, email, displayName, photoURL };
}
