
import { initFirebaseAdminApp } from "./firebase-admin-config";

let app: ReturnType<typeof initFirebaseAdminApp>;

export function getFirebaseAdminApp() {
    if (!app) {
        app = initFirebaseAdminApp();
    }
    return app;
}
