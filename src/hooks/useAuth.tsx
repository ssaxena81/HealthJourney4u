
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
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null; // Keep this for direct profile updates if needed elsewhere
  loading: boolean;
  logout: () => Promise<void>;
  checkAuthState: () => Promise<void>; // Make this part of the context
}>({
  user: null,
  userProfile: null,
  setUserProfile: null,
  loading: true, // Start with loading true
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
      return; // Explicitly return undefined
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
  }, []); // Empty dependency array as db should be stable module-level var

  const contextLogout = useCallback(async () => {
    console.log(`[AuthProvider contextLogout] Called. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextLogout] Firebase Auth instance unavailable.");
      return;
    }
    try {
      setLoading(true); // Indicate loading during logout
      await signOut(firebaseAuthInstance);
      // onAuthStateChanged will handle setting user to null and profile to null
      console.log("[AuthProvider contextLogout] signOut successful. onAuthStateChanged will update state.");
    } catch (error) {
      console.error("[AuthProvider contextLogout] Error signing out:", error);
      setLoading(false); // Ensure loading is false if signout fails
    }
  }, [firebaseAuthInstance]);

  const contextCheckAuthState = useCallback(async () => {
    console.log(`[AuthProvider contextCheckAuthState] MANUALLY CALLED. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextCheckAuthState] Firebase Auth instance unavailable.");
      setUser(null);
      setUserProfileState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    console.log(`[AuthProvider contextCheckAuthState] Set loading to TRUE.`);
    const currentFbUser = firebaseAuthInstance.currentUser;
    console.log(`[AuthProvider contextCheckAuthState] firebaseAuthInstance.currentUser UID: ${currentFbUser?.uid || 'null'}`);
    if (currentFbUser) {
      setUser(currentFbUser); // Update user state from current Firebase user
      await fetchUserProfile(currentFbUser); // Fetch profile for this user
    } else {
      setUser(null);
      setUserProfileState(null);
    }
    setLoading(false);
    console.log(`[AuthProvider contextCheckAuthState] Finished. Loading state is now FALSE. User UID: ${user?.uid || currentFbUser?.uid || 'null'}, Profile ID: ${userProfile?.id || 'null'}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseAuthInstance, fetchUserProfile]); // user and userProfile removed from deps to avoid re-creating function unnecessarily. Relies on values at call time or module scope.

  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] Setting up listener. Current firebaseAuthInstance.currentUser UID (before attach): ${firebaseAuthInstance?.currentUser?.uid || 'null'}. Timestamp: ${new Date().toISOString()}`);
    console.log("  firebaseAuthInstance available:", !!firebaseAuthInstance, "typeof onAuthStateChanged:", typeof firebaseAuthInstance?.onAuthStateChanged);

    if (!firebaseAuthInstance || typeof firebaseAuthInstance.onAuthStateChanged !== 'function') {
      console.warn('[AuthProvider useEffect] Firebase Auth not initialized or onAuthStateChanged not a function. Auth listener NOT set up. Setting loading to false.');
      setLoading(false);
      return () => {};
    }

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      setLoading(true); // Set loading true immediately upon auth state change detection
      console.log(`[AuthProvider onAuthStateChanged CALLBACK FIRED] Received fbUser UID: ${fbUser?.uid || 'null'}. Loading is now TRUE. Timestamp: ${new Date().toISOString()}`);

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
      // Use a timeout to log context state *after* React has a chance to process state updates
      setTimeout(() => {
          console.log(`  [onAuthStateChanged POST-SETTIMEOUT] Context check: User UID: ${firebaseAuthInstance.currentUser?.uid || 'null'}, Profile ID: ${userProfile?.id || 'null'}, Loading: ${loading}`);
      }, 0);
      console.log(`  [onAuthStateChanged] Finished processing. Loading state is now false.`);
    });

    console.log("[AuthProvider useEffect] onAuthStateChanged listener SUBSCRIBED.");
    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener.");
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseAuthInstance, fetchUserProfile]); // Dependencies for setting up the listener

  const contextValue = useMemo(() => {
    return {
      user,
      userProfile,
      setUserProfile: setUserProfileState, // Expose the state setter for profile
      loading,
      logout: contextLogout,
      checkAuthState: contextCheckAuthState,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userProfile, loading, contextLogout, contextCheckAuthState]); // Removed setUserProfileState as it shouldn't be a dep for memoizing the context object itself.

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
    