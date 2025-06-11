
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthModule, db } from '@/lib/firebase/clientApp'; // Aliased import
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

// Define default stubs outside the component for type safety
const defaultLogoutStub = async () => { console.error("AuthContext: DEFAULT logout stub executed. AuthProvider might not be mounted or context not properly updated."); };
const defaultCheckAuthStateStub = async () => { console.error("AuthContext: DEFAULT checkAuthState stub executed."); };

console.log("[AuthProvider Module Scope] firebaseAuthModule from clientApp.ts:", firebaseAuthModule);

const AuthContext = createContext<{
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null;
  loading: boolean;
  logout: () => Promise<void>;
  checkAuthState: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  console.log("[AuthProvider Instance] Initializing AuthProvider. firebaseAuthModule (instance check):", firebaseAuthModule);

  const fetchUserProfile = useCallback(async (fbUser: FirebaseUser) => {
    console.log("[AuthProvider fetchUserProfile] Attempting to fetch profile for UID:", fbUser.uid);
    if (!db || !db.app) {
      console.warn("[AuthProvider fetchUserProfile] Firestore (db) is not initialized. Cannot fetch real profile.");
      setUserProfileState(null);
      return;
    }
    try {
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const profileData = userDocSnap.data() as UserProfile;
        setUserProfileState(profileData);
        console.log("[AuthProvider fetchUserProfile] User profile fetched and set for UID:", fbUser.uid, "Profile:", profileData);
      } else {
        console.warn("[AuthProvider fetchUserProfile] User profile not found in Firestore for UID:", fbUser.uid);
        setUserProfileState(null);
      }
    } catch (error) {
      console.error("[AuthProvider fetchUserProfile] Error fetching user profile for UID:", fbUser.uid, error);
      setUserProfileState(null);
    }
  }, []);

  const contextLogout = useCallback(async () => {
    console.log("!!! [AuthProvider CONTEXT logout CALLED] !!! Attempting to sign out...");
    if (!firebaseAuthModule) {
      console.error("[AuthProvider CONTEXT logout] Firebase Auth instance is not available. Cannot logout.");
      return;
    }
    try {
      await signOut(firebaseAuthModule);
      console.log("[AuthProvider CONTEXT logout] signOut successful via context function.");
      // State updates are handled by onAuthStateChanged
    } catch (error) {
      console.error("[AuthProvider CONTEXT logout] Error signing out via context function:", error);
    }
  }, [firebaseAuthModule]);

  const contextCheckAuthState = useCallback(async () => {
    console.log("!!! [AuthProvider CONTEXT checkAuthState CALLED] !!!");
    if (!firebaseAuthModule) {
      console.error("[AuthProvider CONTEXT checkAuthState] Firebase Auth instance not available.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const currentFbUser = firebaseAuthModule.currentUser;
    console.log("[AuthProvider CONTEXT checkAuthState] Current Firebase user:", currentFbUser ? currentFbUser.uid : 'null');
    if (currentFbUser) {
      setUser(currentFbUser);
      await fetchUserProfile(currentFbUser);
    } else {
      setUser(null);
      setUserProfileState(null);
    }
    setLoading(false);
    console.log("[AuthProvider CONTEXT checkAuthState] Finished. Loading:", false);
  }, [firebaseAuthModule, fetchUserProfile]);

  useEffect(() => {
    console.log("!!! [AuthProvider useEffect for onAuthStateChanged] START. firebaseAuthModule is:", firebaseAuthModule ? "Available" : "NULL or Undefined");

    if (!firebaseAuthModule || typeof firebaseAuthModule.onAuthStateChanged !== 'function') {
      console.warn('[AuthProvider useEffect] Firebase Auth (firebaseAuthModule) is not initialized correctly or onAuthStateChanged is not a function. Auth listener NOT set up. Setting loading to false.');
      setLoading(false);
      return () => {};
    }

    let unsubscribe;
    try {
      console.log("[AuthProvider useEffect] Attempting to set up onAuthStateChanged listener...");
      unsubscribe = onAuthStateChanged(firebaseAuthModule, async (fbUser) => {
        console.log("!!! [AuthProvider onAuthStateChanged FIRED] !!! Received firebaseUser (UID if present):", fbUser ? fbUser.uid : 'null');
        setLoading(true);
        console.log("[AuthProvider onAuthStateChanged] ==> setLoading(true) called.");

        if (fbUser) {
          console.log("[AuthProvider onAuthStateChanged] FirebaseUser IS TRUTHY. UID:", fbUser.uid);
          setUser(fbUser);
          console.log("[AuthProvider onAuthStateChanged] ==> setUser(fbUser) called for UID:", fbUser.uid);
          await fetchUserProfile(fbUser);
          console.log("[AuthProvider onAuthStateChanged] fetchUserProfile completed for UID:", fbUser.uid);
        } else {
          console.log("[AuthProvider onAuthStateChanged] FirebaseUser IS FALSY. Setting user and profile to null.");
          setUser(null);
          setUserProfileState(null);
          console.log("[AuthProvider onAuthStateChanged] ==> setUser(null) and setUserProfileState(null) called.");
        }
        setLoading(false);
        console.log("[AuthProvider onAuthStateChanged] ==> setLoading(false) called. Final state - User UID:", fbUser ? fbUser.uid : 'null', "Loading:", false);
      });
      console.log("[AuthProvider useEffect] onAuthStateChanged listener SUBSCRIBED successfully.");
    } catch (error) {
        console.error("[AuthProvider useEffect] CRITICAL ERROR setting up onAuthStateChanged listener:", error);
        setLoading(false); // Ensure loading is false if listener setup fails
        return () => {}; // Return empty cleanup
    }

    return () => {
      if (unsubscribe) {
        console.log("[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener.");
        unsubscribe();
      } else {
        console.log("[AuthProvider useEffect] Cleanup attempted, but unsubscribe function was not available (listener might not have been set).");
      }
    };
  }, [fetchUserProfile, firebaseAuthModule]);

  const contextValue = useMemo(() => ({
    user,
    userProfile,
    setUserProfile: setUserProfileState,
    loading,
    logout: contextLogout,
    checkAuthState: contextCheckAuthState,
  }), [user, userProfile, loading, contextLogout, contextCheckAuthState]);

  console.log(
      `[AuthProvider RENDER] Context being provided: User UID: ${contextValue.user ? contextValue.user.uid : 'null'} Loading: ${contextValue.loading} Profile ID: ${contextValue.userProfile ? contextValue.userProfile.id : 'null'} Last Logged In: ${contextValue.userProfile?.lastLoggedInDate || 'N/A'}`
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider. Context was undefined.');
  }
  if (context.logout === defaultLogoutStub || context.checkAuthState === defaultCheckAuthStateStub) {
      console.warn("useAuth is returning the default context stubs for logout/checkAuthState. This might be normal during initial SSR passes or if AuthProvider is not correctly wrapping this component tree.");
  }
  return context;
};

    