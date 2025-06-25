
// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

// This check ensures that Firebase is only initialized on the client side.
if (typeof window !== 'undefined') {
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApp();
    }
    auth = getAuth(app);
    db = getFirestore(app);

    // Enable persistence to allow offline data access and potentially stabilize the client state.
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
        console.warn(
            'Firestore persistence failed: This can happen if you have multiple tabs open.'
        );
        } else if (err.code === 'unimplemented') {
        console.warn(
            'Firestore persistence failed: Browser does not support this feature.'
        );
        }
    });
} else {
    // On the server, we need to avoid initializing the client app.
    // We can assign dummy objects or handle it gracefully.
    // For this app's structure, server-side logic uses `serverApp.ts`.
}

export { app as firebaseApp, auth, db };
