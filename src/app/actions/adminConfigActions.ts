
'use server';

import type { ConnectableServicesConfig, TermsAndConditionsConfig, SelectableService } from '@/types';
import { mockFitnessApps, mockDiagnosticServices, mockInsuranceProviders } from '@/types';
// TODO: Import 'db' from '@/lib/firebase/clientApp' and Firestore functions (getDoc, doc) when implementing Firestore fetching.
// import { db } from '@/lib/firebase/clientApp';
// import { doc, getDoc } from 'firebase/firestore';

// --- Connectable Services ---
interface GetConnectableServicesResult {
  success: boolean;
  data?: ConnectableServicesConfig;
  error?: string;
}

export async function getConnectableServicesConfig(): Promise<GetConnectableServicesResult> {
  // TODO: Implement fetching this configuration from Firestore document: 'app_config/connectable_services'
  // For now, returning mock data.
  console.log('[AdminConfigActions] Using mock data for getConnectableServicesConfig.');
  try {
    const mockConfig: ConnectableServicesConfig = {
      fitnessApps: mockFitnessApps,
      diagnosticServices: mockDiagnosticServices,
      insuranceProviders: mockInsuranceProviders,
      lastUpdated: new Date().toISOString(),
    };
    return { success: true, data: mockConfig };
  } catch (error: any) {
    console.error('[AdminConfigActions] Error in mock getConnectableServicesConfig:', error);
    return { success: false, error: String(error.message || 'Failed to load connectable services configuration.') };
  }

  /*
  // --- Example Firestore fetching logic (to be implemented later) ---
  if (!db) {
    console.error('[AdminConfigActions] Firestore (db) not initialized for getConnectableServicesConfig.');
    return { success: false, error: 'Database service unavailable.' };
  }
  try {
    const configDocRef = doc(db, 'app_config', 'connectable_services');
    const docSnap = await getDoc(configDocRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as ConnectableServicesConfig; // Ensure casting is safe
      return { success: true, data };
    } else {
      console.warn('[AdminConfigActions] Connectable services config document does not exist in Firestore.');
      // Fallback to mock data or return error
      return { success: false, error: 'Connectable services configuration not found.' };
    }
  } catch (error: any) {
    console.error('[AdminConfigActions] Error fetching connectable services from Firestore:', error);
    return { success: false, error: String(error.message || 'Failed to load connectable services configuration.') };
  }
  */
}


// --- Terms & Conditions ---
interface GetTermsAndConditionsResult {
  success: boolean;
  data?: TermsAndConditionsConfig;
  error?: string;
}

// This should match the constant in (app)/layout.tsx until dynamic fetching is fully implemented client-side.
const FALLBACK_TERMS_TEXT = `
Last Updated: [Current Date]

1. Acceptance of Terms
By using this application (“App”), you (“User” or “Member”) agree to be bound by these Terms and Conditions, our Privacy Policy, and any additional terms and conditions that may apply to specific sections of the App or to products and services available through the App.

2. Modification of Terms
We reserve the right to change, modify, or update these Terms and Conditions at any time. You will be required to accept the revised terms before continuing to use the App.

// ... (rest of the terms text from your (app)/layout.tsx) ...
// For brevity, I'm not including the full text here again.
// Ensure this fallback is complete if used.

19. Limitations on Medical Data Storage
We do not store raw lab results, clinical notes, or full medical records unless explicitly authorized by you. If authorized, data is encrypted and only retained as needed for your selected services.
`;

const FALLBACK_TERMS_VERSION = "1.0";


export async function getTermsAndConditionsConfig(): Promise<GetTermsAndConditionsResult> {
  // TODO: Implement fetching this configuration from Firestore document: 'app_config/terms_and_conditions'
  // For now, returning hardcoded data.
  console.log('[AdminConfigActions] Using hardcoded data for getTermsAndConditionsConfig.');
   try {
    const mockConfig: TermsAndConditionsConfig = {
      currentVersion: FALLBACK_TERMS_VERSION,
      text: FALLBACK_TERMS_TEXT, // Use the constant defined in (app)/layout.tsx for now
      publishedAt: new Date().toISOString(),
    };
    return { success: true, data: mockConfig };
  } catch (error: any) {
    console.error('[AdminConfigActions] Error in mock getTermsAndConditionsConfig:', error);
    return { success: false, error: String(error.message || 'Failed to load Terms & Conditions.') };
  }

  /*
  // --- Example Firestore fetching logic (to be implemented later) ---
  if (!db) {
    console.error('[AdminConfigActions] Firestore (db) not initialized for getTermsAndConditionsConfig.');
    return { success: false, error: 'Database service unavailable.' };
  }
  try {
    const configDocRef = doc(db, 'app_config', 'terms_and_conditions');
    const docSnap = await getDoc(configDocRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as TermsAndConditionsConfig; // Ensure casting is safe
      return { success: true, data };
    } else {
      console.warn('[AdminConfigActions] Terms & Conditions config document does not exist in Firestore.');
      // Fallback to hardcoded or return error
      return { success: false, error: 'Terms & Conditions configuration not found.' };
    }
  } catch (error: any) {
    console.error('[AdminConfigActions] Error fetching Terms & Conditions from Firestore:', error);
    return { success: false, error: String(error.message || 'Failed to load Terms & Conditions.') };
  }
  */
}
