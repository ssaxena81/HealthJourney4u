'use server';

import { initFirebaseAdminApp } from "./firebase-admin-config";
import type { App } from 'firebase-admin/app';

let app: App;

export async function getFirebaseAdminApp() {
    if (!app) {
        app = await initFirebaseAdminApp();
    }
    return app;
}
