import * as admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      const parsed = JSON.parse(serviceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(parsed),
      });
    } else {
      // Fallback: use project ID if available
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      admin.initializeApp({
        projectId: projectId,
      });
    }
  } catch (err) {
    console.warn("Firebase Admin init error:", err);
  }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
