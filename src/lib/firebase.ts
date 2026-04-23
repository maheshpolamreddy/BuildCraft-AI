"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim(),
};

// Client-only module: do not import from Server Components.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Use getAuth (not initializeAuth with partial deps): partial initializeAuth omits
// popupRedirectResolver and triggers auth/argument-error on signInWithPopup / signInWithRedirect.
// getAuth wires browser defaults (persistence + resolver) and avoids SSR/build assertion issues.
export const auth = getAuth(app);

export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
// Account picker on every sign-in; helps multi-account and redirect return flows.
googleProvider.setCustomParameters({ prompt: "select_account" });

// Analytics only runs in the browser (not during SSR)
export const analyticsPromise = isSupported().then((yes) =>
  yes ? getAnalytics(app) : null
);
