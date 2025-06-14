
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthModule, db } from '@/lib/firebase/clientApp'; // Aliased import
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

const defaultLogoutStub = async () => { console.error("AuthContext: DEFAULT logout stub executed."); };
const defaultCheckAuthStateStub = async () => { console.error("AuthContext: DEFAULT checkAuthState stub executed."); };

console.log("[useAuth.tsx Module Scope] firebaseAuthModule:", firebaseAuthModule);

const AuthContext = createContext<{
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null; // Kept for direct manipulation if needed, though primarily internal
  loading: boolean;
  logout: () => Promise<void>;
  checkAuthState: () => Promise<void>; // Exposed for specific manual refresh scenarios
}>({
  user: null,
  userProfile: null,
  setUserProfile: null,
  loading: true,
  logout: defaultLogoutStub,
  checkAuthState: defaultCheckAuthStateStub,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // True until initial auth state is determined
  const firebaseAuthInstance = firebaseAuthModule;

  console.log(`[AuthProvider Root Level] Timestamp: ${new Date().toISOString()}`);
  console.log("  firebaseAuthInstance available:", !!firebaseAuthInstance);

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
        console.log(`[AuthProvider fetchUserProfile] Profile fetched for UID: ${fbUser.uid}. Profile setupComplete: ${profileData.profileSetupComplete}`);
      } else {
        console.warn(`[AuthProvider fetchUserProfile] Profile NOT FOUND in Firestore for UID: ${fbUser.uid}`);
        setUserProfileState(null);
      }
    } catch (error) {
      console.error(`[AuthProvider fetchUserProfile] ERROR fetching profile for UID: ${fbUser.uid}`, error);
      setUserProfileState(null);
    }
  }, []); // Empty dependency array as db should be stable from module scope

  const contextLogout = useCallback(async () => {
    console.log(`[AuthProvider contextLogout] Called. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextLogout] Firebase Auth instance unavailable.");
      return;
    }
    try {
      await signOut(firebaseAuthInstance);
      // onAuthStateChanged will handle setting user and userProfile to null
      console.log("[AuthProvider contextLogout] signOut successful.");
    } catch (error) {
      console.error("[AuthProvider contextLogout] Error signing out:", error);
    }
  }, [firebaseAuthInstance]);

  // This function is for manual re-checking, typically not needed if onAuthStateChanged works well.
  const contextCheckAuthState = useCallback(async () => {
    console.log(`[AuthProvider contextCheckAuthState] MANUALLY CALLED. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextCheckAuthState] Firebase Auth instance unavailable.");
      setUser(null);
      setUserProfileState(null);
      setLoading(false); // Ensure loading is false if auth can't be checked
      return;
    }
    setLoading(true);
    const currentFbUser = firebaseAuthInstance.currentUser;
    console.log(`[AuthProvider contextCheckAuthState] firebaseAuthInstance.currentUser UID: ${currentFbUser?.uid || 'null'}`);
    if (currentFbUser) {
      setUser(currentFbUser);
      await fetchUserProfile(currentFbUser);
    } else {
      setUser(null);
      setUserProfileState(null);
    }
    setLoading(false);
    console.log(`[AuthProvider contextCheckAuthState] Finished. Loading: ${false}, User UID: ${currentFbUser?.uid || 'null'}`);
  }, [firebaseAuthInstance, fetchUserProfile]);

  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] Setting up listener. Timestamp: ${new Date().toISOString()}`);
    console.log("  firebaseAuthInstance available:", !!firebaseAuthInstance, "typeof onAuthStateChanged:", typeof firebaseAuthInstance?.onAuthStateChanged);

    if (!firebaseAuthInstance || typeof firebaseAuthInstance.onAuthStateChanged !== 'function') {
      console.warn('[AuthProvider useEffect] Firebase Auth not initialized or onAuthStateChanged not a function. Auth listener NOT set up. Setting loading to false.');
      setLoading(false);
      return () => {}; // Return empty cleanup
    }

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log(`[AuthProvider onAuthStateChanged CALLBACK FIRED] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${new Date().toISOString()}`);
      // setLoading(true); // DO NOT set loading true here again, initial useState(true) covers the "initial load"

      if (fbUser) {
        console.log(`  [onAuthStateChanged] User is PRESENT. UID: ${fbUser.uid}`);
        setUser(fbUser); // Update user state
        await fetchUserProfile(fbUser); // Fetch/update profile
      } else {
        console.log("  [onAuthStateChanged] User is NULL.");
        setUser(null);
        setUserProfileState(null);
      }
      setLoading(false); // Critical: set loading to false AFTER processing the auth state
      console.log(`  [onAuthStateChanged] Finished processing. Loading state now: false. User in context: ${fbUser?.uid || 'null'}`);
    });

    console.log("[AuthProvider useEffect] onAuthStateChanged listener SUBSCRIBED.");
    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener.");
      unsubscribe();
    };
  }, [firebaseAuthInstance, fetchUserProfile]); // Dependencies: firebaseAuthInstance and fetchUserProfile

  const contextValue = useMemo(() => {
    return {
      user,
      userProfile,
      setUserProfile: setUserProfileState, // Allow direct manipulation if absolutely necessary by consumers
      loading,
      logout: contextLogout,
      checkAuthState: contextCheckAuthState,
    };
  }, [user, userProfile, loading, contextLogout, contextCheckAuthState]);

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

    