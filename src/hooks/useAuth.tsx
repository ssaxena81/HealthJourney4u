
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthModule, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

// This is firebaseAuthModule from clientApp.ts
const firebaseAuthInstance = firebaseAuthModule;

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  setUserProfile: null,
  loading: true, // Initialize loading to true
  logout: async () => { console.error("AuthContext: Default logout stub executed."); },
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  console.log(`[AuthProvider BODY START] Component rendering. Timestamp: ${new Date().toISOString()}`);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Crucial: Initialize to true

  console.log(`[AuthProvider State Init] user: ${user?.uid || 'null'}, loading: ${loading}. Timestamp: ${new Date().toISOString()}`);
  console.log("  firebaseAuthInstance (from clientApp.ts) available at AuthProvider module scope:", !!firebaseAuthInstance);

  const fetchUserProfile = useCallback(async (fbUser: FirebaseUser) => {
    console.log(`[AuthProvider fetchUserProfile] Called for UID: ${fbUser.uid}. Timestamp: ${new Date().toISOString()}`);
    if (!db) {
      console.warn("[AuthProvider fetchUserProfile] Firestore (db) is not initialized. Cannot fetch profile.");
      setUserProfileState(null);
      return;
    }
    try {
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const profileData = userDocSnap.data() as UserProfile;
        setUserProfileState(profileData);
        console.log(`[AuthProvider fetchUserProfile] Profile fetched for UID: ${fbUser.uid}. Profile Setup Complete: ${profileData.profileSetupComplete}. Data:`, JSON.stringify(profileData));
      } else {
        console.warn(`[AuthProvider fetchUserProfile] Profile NOT FOUND in Firestore for UID: ${fbUser.uid}`);
        setUserProfileState(null);
      }
    } catch (error) {
      console.error(`[AuthProvider fetchUserProfile] ERROR fetching profile for UID: ${fbUser.uid}`, error);
      setUserProfileState(null);
    }
  }, []); // db is stable from module scope

  const contextLogout = useCallback(async () => {
    console.log(`[AuthProvider contextLogout] Called. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextLogout] Firebase Auth instance unavailable for logout.");
      // Manually reset state if auth instance is gone, though onAuthStateChanged should also fire with null
      setLoading(true);
      setUser(null);
      setUserProfileState(null);
      setLoading(false);
      return;
    }
    await signOut(firebaseAuthInstance);
    // onAuthStateChanged should handle further state updates.
  }, [firebaseAuthInstance]);

  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${new Date().toISOString()}`); // THIS IS THE CRITICAL LOG
    setLoading(true);
    console.log(`  [AuthProvider useEffect] Set loading to TRUE. firebaseAuthInstance type: ${typeof firebaseAuthInstance}, onAuthStateChanged type: ${typeof firebaseAuthInstance?.onAuthStateChanged}`);

    if (!firebaseAuthInstance || typeof firebaseAuthInstance.onAuthStateChanged !== 'function') {
      console.warn(`[AuthProvider useEffect] Firebase Auth instance NOT READY (instance is ${firebaseAuthInstance ? 'defined' : 'null/undefined'}, onAuthStateChanged is ${typeof firebaseAuthInstance?.onAuthStateChanged}). Auth listener NOT set up. Setting loading to false.`);
      setUser(null);
      setUserProfileState(null);
      setLoading(false);
      return; // Return undefined (implicitly)
    }

    console.log(`[AuthProvider useEffect] Subscribing to onAuthStateChanged...`);
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log(`[AuthProvider onAuthStateChanged CALLBACK FIRED] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${new Date().toISOString()}`);
      // setLoading(true); // Already set at the start of useEffect, ensure it's true for processing

      if (fbUser) {
        console.log(`  [onAuthStateChanged Callback] User is PRESENT. UID: ${fbUser.uid}.`);
        setUser(fbUser); // Update user state first
        console.log(`  [onAuthStateChanged Callback] Calling fetchUserProfile for UID: ${fbUser.uid}`);
        await fetchUserProfile(fbUser); // Then fetch profile
      } else {
        console.log("  [onAuthStateChanged Callback] User is NULL. Resetting user and profile state.");
        setUser(null);
        setUserProfileState(null);
      }
      console.log("  [onAuthStateChanged Callback] All async operations complete. Setting loading to false.");
      setLoading(false); // Set loading to false after all processing for this auth state change
    });

    console.log("[AuthProvider useEffect] Listener SUBSCRIBED.");
    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP listener.");
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // TEMPORARY: Empty dependency array for testing. Correct: [firebaseAuthInstance, fetchUserProfile]

  const contextValue = useMemo(() => {
    return {
      user,
      userProfile,
      setUserProfile: setUserProfileState,
      loading,
      logout: contextLogout,
    };
  }, [user, userProfile, loading, contextLogout]);

  console.log(`[AuthProvider RENDER] Timestamp: ${new Date().toISOString()}. Context: User UID: ${contextValue.user?.uid || 'null'}, Loading: ${contextValue.loading}, Profile ID: ${contextValue.userProfile?.id || 'null'}`);
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
};
