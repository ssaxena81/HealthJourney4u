
'use client';

import React, { useState, useEffect, createContext, useContext } from 'react'; // Added createContext, useContext
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

// --- Minimal Context for this test ---
interface MinimalAuthContextType {
  minimalUser: FirebaseUser | null;
  minimalLoading: boolean;
}
const MinimalAuthContext = createContext<MinimalAuthContextType>({
  minimalUser: null,
  minimalLoading: true,
});
// --- End Minimal Context ---

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  console.log(`[AuthProvider MINIMAL BODY START] Timestamp: ${new Date().toISOString()}`);
  const [minimalUser, setMinimalUser] = useState<FirebaseUser | null>(null);
  const [minimalLoading, setMinimalLoading] = useState(true);
  console.log(`  [AuthProvider MINIMAL State Init] firebaseAuthInstance available: ${!!firebaseAuthInstance}`);

  useEffect(() => {
    // THIS IS THE CRITICAL LOG WE NEED TO SEE
    console.log(`[AuthProvider MINIMAL useEffect for Listener] EXECUTING EFFECT. Timestamp: ${new Date().toISOString()}`);
    console.log(`  [AuthProvider MINIMAL useEffect] firebaseAuthInstance in effect: ${!!firebaseAuthInstance}`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider MINIMAL useEffect] Firebase Auth instance NOT READY. Setting loading false.`);
      setMinimalLoading(false);
      return;
    }

    console.log(`  [AuthProvider MINIMAL useEffect] Subscribing to onAuthStateChanged...`);
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, (fbUser) => {
      console.log(`  [AuthProvider MINIMAL onAuthStateChanged CALLBACK] User UID: ${fbUser?.uid || 'null'}`);
      setMinimalUser(fbUser);
      // In a real scenario, you'd fetch profile here if fbUser exists
      setMinimalLoading(false);
      console.log(`  [AuthProvider MINIMAL onAuthStateChanged CALLBACK] Set loading to false.`);
    });

    console.log("  [AuthProvider MINIMAL useEffect] Listener SUBSCRIBED.");
    return () => {
      console.log("[AuthProvider MINIMAL useEffect] CLEANING UP listener.");
      unsubscribe();
    };
  }, []); // EMPTY DEPENDENCY ARRAY

  console.log(`[AuthProvider MINIMAL RENDER] Timestamp: ${new Date().toISOString()}`);
  return (
    <MinimalAuthContext.Provider value={{ minimalUser, minimalLoading }}>
      {children}
    </MinimalAuthContext.Provider>
  );
};

// Update useAuth to use the minimal context for this test, or comment out its usage if it causes issues elsewhere temporarily
export const useAuth = () => {
  const context = useContext(MinimalAuthContext);
  if (context === undefined) {
    // This might happen if other parts of the app still expect the full AuthContext
    // For this specific test, we're focused on AuthProvider's internal useEffect
    console.warn('useAuth hook called outside of the new MinimalAuthContext during this test. Returning dummy values.');
    return { user: null, userProfile: null, loading: true, logout: async () => {}, setUserProfile: null };
  }
  // Map minimal context to expected structure for other components, or adjust them later
  return { 
    user: context.minimalUser, 
    userProfile: null, // No profile in this minimal version
    loading: context.minimalLoading, 
    logout: async () => { console.log("Minimal logout called"); if(firebaseAuthInstance) signOut(firebaseAuthInstance); },
    setUserProfile: null // No setUserProfile in this minimal version
  };
};

    