
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthModule, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

const defaultLogoutStub = async () => { console.error("AuthContext: DEFAULT logout stub executed."); };
const defaultCheckAuthStateStub = async () => { console.error("AuthContext: DEFAULT checkAuthState stub executed."); };

console.log("[useAuth.tsx Module Scope] firebaseAuthModule:", firebaseAuthModule);

const AuthContext = createContext<{
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null;
  loading: boolean;
  logout: () => Promise<void>;
  checkAuthState: () => Promise<void>; // Kept for potential manual checks
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
  const [loading, setLoading] = useState(true); // Start true for initial auth check
  const firebaseAuthInstance = firebaseAuthModule;

  console.log(`[AuthProvider Root Level] Timestamp: ${new Date().toISOString()}`);
  console.log("  firebaseAuthInstance available:", !!firebaseAuthInstance);

  const fetchUserProfile = useCallback(async (fbUser: FirebaseUser) => {
    console.log(`[AuthProvider fetchUserProfile] Called for UID: ${fbUser.uid}. Timestamp: ${new Date().toISOString()}`);
    if (!db) {
      console.warn("[AuthProvider fetchUserProfile] Firestore (db) is not initialized. Cannot fetch profile.");
      setUserProfileState(null);
      return; // Return null or a specific error object if needed
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
  }, []);

  const contextLogout = useCallback(async () => {
    console.log(`[AuthProvider contextLogout] Called. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextLogout] Firebase Auth instance unavailable.");
      return;
    }
    // onAuthStateChanged will handle setting loading, user, and userProfile
    await signOut(firebaseAuthInstance);
    console.log("[AuthProvider contextLogout] signOut successful. onAuthStateChanged will update state.");
  }, [firebaseAuthInstance]);

  // This function is for manual checks, not the primary login flow.
  const contextCheckAuthState = useCallback(async () => {
    console.log(`[AuthProvider contextCheckAuthState] MANUALLY CALLED. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextCheckAuthState] Firebase Auth instance unavailable. Cannot check state.");
      setUser(null); setUserProfileState(null); setLoading(false);
      return;
    }
    setLoading(true);
    console.log(`  [contextCheckAuthState] Set loading to TRUE.`);
    const currentFbUser = firebaseAuthInstance.currentUser;
    console.log(`  [contextCheckAuthState] firebaseAuthInstance.currentUser UID: ${currentFbUser?.uid || 'null'}`);
    if (currentFbUser) {
      setUser(currentFbUser);
      await fetchUserProfile(currentFbUser);
    } else {
      setUser(null);
      setUserProfileState(null);
    }
    setLoading(false);
    console.log(`  [contextCheckAuthState] Finished. Loading state is now FALSE. User UID: ${currentFbUser?.uid || 'null'}, Profile ID: ${userProfile?.id || 'null'}`);
  }, [firebaseAuthInstance, fetchUserProfile, userProfile?.id]); // userProfile.id dependency might be problematic here, review if causes loops

  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] Setting up listener. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance || typeof firebaseAuthInstance.onAuthStateChanged !== 'function') {
      console.warn('[AuthProvider useEffect] Firebase Auth not initialized or onAuthStateChanged not a function. Auth listener NOT set up. Setting loading to false.');
      setLoading(false);
      return () => {};
    }

    setLoading(true); // Set loading true when the listener setup effect runs for the first time
    console.log(`[AuthProvider useEffect onAuthStateChanged setup] Initial setLoading(true) for listener setup.`);

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log(`[AuthProvider onAuthStateChanged CALLBACK FIRED] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${new Date().toISOString()}`);
      setLoading(true); // Set loading true whenever auth state might be changing
      console.log(`  [onAuthStateChanged] Set loading to TRUE.`);

      if (fbUser) {
        console.log(`  [onAuthStateChanged] User is PRESENT. UID: ${fbUser.uid}. Setting user state.`);
        setUser(fbUser);
        console.log(`  [onAuthStateChanged] Calling fetchUserProfile for UID: ${fbUser.uid}`);
        await fetchUserProfile(fbUser);
      } else {
        console.log("  [onAuthStateChanged] User is NULL. Resetting user and profile state.");
        setUser(null);
        setUserProfileState(null);
      }
      setLoading(false);
      console.log(`  [onAuthStateChanged] Finished processing. Loading state is now FALSE. Current context user (after state updates): ${fbUser?.uid || 'null'}`);
    });

    console.log("[AuthProvider useEffect] onAuthStateChanged listener SUBSCRIBED.");
    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener.");
      unsubscribe();
    };
  }, [firebaseAuthInstance, fetchUserProfile]); // Dependencies: firebaseAuthInstance, fetchUserProfile

  const contextValue = useMemo(() => {
    return {
      user,
      userProfile,
      setUserProfile: setUserProfileState,
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
    
