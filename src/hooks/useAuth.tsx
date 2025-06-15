
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthModule, db } from '@/lib/firebase/clientApp'; // firebaseAuthModule is the initialized Auth instance
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

const defaultLogoutStub = async () => { console.error("AuthContext: DEFAULT logout stub executed."); };

console.log("[useAuth.tsx Module Scope] firebaseAuthModule from clientApp:", firebaseAuthModule);

const AuthContext = createContext<{
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null;
  loading: boolean;
  logout: () => Promise<void>;
  // checkAuthState is removed as onAuthStateChanged should be the source of truth
}>({
  user: null,
  userProfile: null,
  setUserProfile: null,
  loading: true, // Start as true until initial auth state is resolved
  logout: defaultLogoutStub,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Start true for initial auth check
  const firebaseAuthInstance = firebaseAuthModule; // Use the directly imported auth instance

  console.log(`[AuthProvider Root Level] Timestamp: ${new Date().toISOString()}`);
  console.log("  firebaseAuthInstance (from clientApp.ts) available:", !!firebaseAuthInstance);

  const fetchUserProfile = useCallback(async (fbUser: FirebaseUser) => {
    console.log(`[AuthProvider fetchUserProfile] Called for UID: ${fbUser.uid}. Timestamp: ${new Date().toISOString()}`);
    if (!db) {
      console.warn("[AuthProvider fetchUserProfile] Firestore (db) is not initialized. Cannot fetch profile.");
      setUserProfileState(null); // Ensure profile is null if db is not available
      return;
    }
    try {
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const profileData = userDocSnap.data() as UserProfile;
        setUserProfileState(profileData);
        console.log(`[AuthProvider fetchUserProfile] Profile fetched for UID: ${fbUser.uid}. Profile Setup Complete: ${profileData.profileSetupComplete}`);
      } else {
        console.warn(`[AuthProvider fetchUserProfile] Profile NOT FOUND in Firestore for UID: ${fbUser.uid}`);
        setUserProfileState(null);
      }
    } catch (error) {
      console.error(`[AuthProvider fetchUserProfile] ERROR fetching profile for UID: ${fbUser.uid}`, error);
      setUserProfileState(null);
    }
  }, []); // No dependencies, as `db` is module-scoped from clientApp

  const contextLogout = useCallback(async () => {
    console.log(`[AuthProvider contextLogout] Called. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextLogout] Firebase Auth instance unavailable.");
      return;
    }
    // onAuthStateChanged will handle setting loading, user, and userProfile to null
    await signOut(firebaseAuthInstance);
    console.log("[AuthProvider contextLogout] signOut successful. onAuthStateChanged will update state.");
  }, [firebaseAuthInstance]);

  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] Setting up listener. Current loading state: ${loading}. Timestamp: ${new Date().toISOString()}`);
    // setLoading(true); // Explicitly set loading true before listener attachment only if not already true. Initial state handles first load.

    if (!firebaseAuthInstance || typeof firebaseAuthInstance.onAuthStateChanged !== 'function') {
      console.warn('[AuthProvider useEffect] Firebase Auth not initialized or onAuthStateChanged is not a function. Auth listener NOT set up. Setting loading to false.');
      setLoading(false); // Ensure loading becomes false if auth is unusable
      return () => {};
    }

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log(`[AuthProvider onAuthStateChanged CALLBACK FIRED] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${new Date().toISOString()}`);
      // setLoading(true) here ensures that any downstream component sees loading=true during this async processing
      setLoading(true); 
      console.log(`  [onAuthStateChanged] Set loading to TRUE for auth state processing.`);

      if (fbUser) {
        console.log(`  [onAuthStateChanged] User is PRESENT. UID: ${fbUser.uid}. Updating user state.`);
        setUser(fbUser);
        console.log(`  [onAuthStateChanged] Calling fetchUserProfile for UID: ${fbUser.uid}`);
        await fetchUserProfile(fbUser); // This will set userProfileState
      } else {
        console.log("  [onAuthStateChanged] User is NULL. Resetting user and profile state.");
        setUser(null);
        setUserProfileState(null);
      }
      
      console.log("  [onAuthStateChanged] All async operations complete. Setting loading to false.");
      setLoading(false);
    });

    console.log("[AuthProvider useEffect] onAuthStateChanged listener SUBSCRIBED.");
    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener.");
      unsubscribe();
    };
  }, [firebaseAuthInstance, fetchUserProfile]); // fetchUserProfile is stable due to useCallback

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
