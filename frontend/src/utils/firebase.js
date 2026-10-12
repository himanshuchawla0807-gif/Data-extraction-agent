
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app = null;
let auth = null;
let googleProvider = null;

try {
    if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId) {
        if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) throw new Error('Firebase web configuration is missing');
    app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        googleProvider = new GoogleAuthProvider();
        console.log('[Firebase] Initialized for project:', firebaseConfig.projectId);
    } else {
        console.info('[Firebase] Disabled. Add VITE_FIREBASE_* values to enable hosted auth.');
    }
} catch (error) {
    console.error('[Firebase] Initialization failed:', error);
}

export { app, auth, googleProvider };
