
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthModule, db } from '@/lib/firebase/clientApp'; // Aliased import
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation'; // For client-side navigation where needed

// Define default stubs outside the component for type safety and to avoid "not defined" if context is somehow used before provider fully initializes
const defaultLogoutStub = async () => { console.error("AuthContext: DEFAULT logout stub executed. AuthProvider might not be mounted or context not properly updated."); };
const defaultCheckAuthStateStub = async () => { console.error("AuthContext: DEFAULT checkAuthState stub executed."); };

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
  // const router = useRouter(); // Not used directly by functions passed to context anymore

  const firebaseAuthInstance = firebaseAuthModule;

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
        console.log("[AuthProvider fetchUserProfile] User profile fetched and set for UID:", fbUser.uid);
      } else {
        console.warn("[AuthProvider fetchUserProfile] User profile not found in Firestore for UID:", fbUser.uid);
        setUserProfileState(null);
      }
    } catch (error) {
      console.error("[AuthProvider fetchUserProfile] Error fetching user profile for UID:", fbUser.uid, error);
      setUserProfileState(null);
    }
  }, []); // firebaseAuthInstance is module-level, db is module-level

  // Define logout function for the context
  const contextLogout = useCallback(async () => {
    console.log("!!! [AuthProvider CONTEXT logout CALLED] !!! Attempting to sign out...");
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider CONTEXT logout] Firebase Auth instance is not available. Cannot logout.");
      return;
    }
    try {
      await signOut(firebaseAuthInstance);
      console.log("[AuthProvider CONTEXT logout] signOut successful via context function.");
      // Actual state updates (user to null, profile to null) will be handled by onAuthStateChanged
      // Navigation should be handled by the component calling this logout function (e.g., SidebarNav)
    } catch (error) {
      console.error("[AuthProvider CONTEXT logout] Error signing out via context function:", error);
    }
  }, [firebaseAuthInstance]); // Dependency is stable

  // Define checkAuthState function for the context
  const contextCheckAuthState = useCallback(async () => {
    console.log("!!! [AuthProvider CONTEXT checkAuthState CALLED] !!!");
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider CONTEXT checkAuthState] Firebase Auth instance not available.");
      setLoading(false); // Ensure loading is false if we can't proceed
      return;
    }
    setLoading(true);
    const currentFbUser = firebaseAuthInstance.currentUser;
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
  }, [firebaseAuthInstance, fetchUserProfile]); // Dependencies

  useEffect(() => {
    console.log("[AuthProvider useEffect] Setting up onAuthStateChanged listener. Firebase Auth instance:", firebaseAuthInstance ? "Available" : "NULL");
    if (!firebaseAuthInstance || typeof firebaseAuthInstance.onAuthStateChanged !== 'function') {
      console.warn('[AuthProvider useEffect] Firebase Auth is not initialized or onAuthStateChanged is not a function. Setting loading to false.');
      setLoading(false);
      return () => {};
    }

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log("!!! [AuthProvider onAuthStateChanged FIRED] !!! Received firebaseUser (UID if present):", fbUser ? fbUser.uid : 'null');
      setLoading(true); // Set loading true at the start of processing this event
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
      setLoading(false); // Set loading false at the end of processing this event
      console.log("[AuthProvider onAuthStateChanged] ==> setLoading(false) called. Final state - User UID:", fbUser ? fbUser.uid : 'null', "Loading:", false, "Profile Set:", !!userProfile);
    });

    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener.");
      unsubscribe();
    };
  }, [fetchUserProfile, firebaseAuthInstance]);


  // Log right before returning the Provider
  // This log is crucial for SSR debugging if the error points here
  console.log(
      "[AuthProvider RENDER] Preparing context value. User:", user ? user.uid : 'null',
      "Loading:", loading,
      "contextLogout is func:", typeof contextLogout === 'function',
      "contextCheckAuthState is func:", typeof contextCheckAuthState === 'function'
  );

  // This is line 106 (or around it, depending on exact formatting/comments above)
  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      setUserProfile: setUserProfileState,
      loading,
      logout: contextLogout, // Pass the useCallback-wrapped function
      checkAuthState: contextCheckAuthState // Pass the useCallback-wrapped function
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) { // Check for undefined, which is the default if not wrapped
    throw new Error('useAuth must be used within an AuthProvider. Context was undefined.');
  }
  // Check if the functions are still the stubs, indicating AuthProvider might not have initialized its value for this consumer
  if (context.logout === defaultLogoutStub) {
      console.warn("useAuth is returning the default context stubs for logout/checkAuthState. This might be normal during initial SSR passes or if AuthProvider is not correctly wrapping this component tree.");
  }
  return context;
};
