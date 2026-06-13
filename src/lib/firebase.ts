import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

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

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  client_id: "199332945502-85kfbpqiir99fhbl9arap2alrle4sn77.apps.googleusercontent.com",
  prompt: "select_account",
});

export interface GoogleResult {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
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
