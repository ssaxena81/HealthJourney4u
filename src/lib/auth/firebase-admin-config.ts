'use server';

import * as admin from 'firebase-admin';

export async function initFirebaseAdminApp() {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.');
    }
    
    if (admin.apps.length > 0) {
        return admin.app();
    }

    try {
        const serviceAccount = JSON.parse(serviceAccountKey);
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error('Error parsing Firebase service account key:', error);
        throw new Error('Could not initialize Firebase Admin SDK.');
    }
}
