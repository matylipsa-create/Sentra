import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCQq4nOjI40glv8vDbQZNtN_nAzj8tZ138",
  authDomain: "sentra-security-system.firebaseapp.com",
  projectId: "sentra-security-system",
  storageBucket: "sentra-security-system.firebasestorage.app",
  messagingSenderId: "199332945502",
  appId: "1:199332945502:web:80849d2eab3a8dfb8d9ecf",
  measurementId: "G-5985BMM938"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  client_id: "199332945502-85kfbpqiir99fhbl9arap2alrle4sn77.apps.googleusercontent.com"
});

// Always use redirect — avoids popup-blocked across all browsers and WebViews
export async function firebaseGoogleSignIn(): Promise<never> {
  await signInWithRedirect(auth, googleProvider);
  // signInWithRedirect navigates away; this line is never reached
  return new Promise(() => {});
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
