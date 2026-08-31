import { initializeApp } from "firebase/app";

import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  GithubAuthProvider,
} from "firebase/auth";

import {
  getFirestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

/*
 * Google
 */
export const googleProvider = new GoogleAuthProvider();

/*
 * Apple
 */
export const appleProvider = new OAuthProvider("apple.com");

/*
 * Microsoft
 * Firebase không export MicrosoftAuthProvider.
 * Microsoft sử dụng OAuthProvider với provider ID:
 * "microsoft.com"
 */
export const microsoftProvider = new OAuthProvider(
  "microsoft.com"
);

/*
 * GitHub
 */
export const githubProvider = new GithubAuthProvider();

export default app;