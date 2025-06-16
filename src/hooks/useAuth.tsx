
'use client';

import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

// --- Full AuthContextType ---
interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  checkAuthState: () => Promise<void>; // For manual re-check if ever needed
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null; // Allow direct update
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
// --- End Full AuthContextType ---

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  console.log(`[AuthProvider BODY START] Component rendering. Timestamp: ${new Date().toISOString()}`);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Start true until initial check completes

  console.log(`[AuthProvider State Init] user: ${user?.uid || null}, loading: ${loading}. Timestamp: ${new Date().toISOString()}`);
  console.log(`  firebaseAuthInstance (from clientApp.ts) available at AuthProvider module scope: ${!!firebaseAuthInstance}`);

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
    console.log(`[AuthProvider fetchUserProfile] Called for UID: ${firebaseUser.uid}. Timestamp: ${new Date().toISOString()}`);
    if (!db) {
      console.error('[AuthProvider fetchUserProfile] Firestore (db) not initialized.');
      setLoading(false); // Ensure loading is false if db fails early
      return null;
    }
    try {
      const userProfileDocRef = doc(db, 'users', firebaseUser.uid);
      const userProfileSnap = await getDoc(userProfileDocRef);
      if (userProfileSnap.exists()) {
        const profileData = userProfileSnap.data() as UserProfile;
        console.log(`[AuthProvider fetchUserProfile] Profile FOUND for UID: ${firebaseUser.uid}`, profileData);
        return profileData;
      } else {
        console.log(`[AuthProvider fetchUserProfile] Profile NOT FOUND for UID: ${firebaseUser.uid}.`);
        return null;
      }
    } catch (error) {
      console.error(`[AuthProvider fetchUserProfile] Error fetching profile for UID ${firebaseUser.uid}:`, error);
      return null;
    }
  }, []); // `db` is stable from module scope

  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${new Date().toISOString()}`);
    console.log(`  firebaseAuthInstance in effect: ${!!firebaseAuthInstance}`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect] Firebase Auth instance NOT READY. Setting loading false and returning.`);
      setLoading(false);
      return;
    }

    console.log(`  [AuthProvider useEffect] Subscribing to onAuthStateChanged...`);
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log(`[AuthProvider onAuthStateChanged CALLBACK START] User UID: ${fbUser?.uid || 'null'}. Timestamp: ${new Date().toISOString()}`);
      setLoading(true); 
      console.log(`  [AuthProvider onAuthStateChanged] Set loading to TRUE.`);

      if (fbUser) {
        console.log(`  [AuthProvider onAuthStateChanged] User is PRESENT (UID: ${fbUser.uid}). Setting user state.`);
        setUser(fbUser);
        console.log(`  [AuthProvider onAuthStateChanged] Fetching profile for UID: ${fbUser.uid}...`);
        const profile = await fetchUserProfile(fbUser);
        setUserProfileState(profile);
        console.log(`  [AuthProvider onAuthStateChanged] Profile fetched (result: ${profile ? 'found' : 'null'}), set userProfile state.`);
      } else {
        console.log(`  [AuthProvider onAuthStateChanged] User is NULL. Clearing user and userProfile states.`);
        setUser(null);
        setUserProfileState(null);
      }
      setLoading(false);
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK END] Set loading to FALSE. Final context state - User: ${fbUser?.uid || 'null'}, Profile: ${!!userProfileState}, Loading: false`);
    });

    console.log("  [AuthProvider useEffect] Listener SUBSCRIBED.");
    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener.");
      unsubscribe();
    };
  }, [firebaseAuthInstance, fetchUserProfile]);


  const contextLogout = useCallback(async () => {
    console.log("[AuthProvider contextLogout] Called.");
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextLogout] Firebase Auth instance not available for logout.");
      return;
    }
    // setLoading(true); // No need, onAuthStateChanged will handle this
    try {
      await signOut(firebaseAuthInstance);
      console.log("[AuthProvider contextLogout] signOut successful. onAuthStateChanged will update context.");
    } catch (error) {
      console.error('[AuthProvider contextLogout] Logout error:', error);
      setLoading(false); // Ensure loading is false if signOut fails and onAuthStateChanged doesn't fire
    }
  }, [firebaseAuthInstance]);


  const contextCheckAuthState = useCallback(async () => {
    console.log(`[AuthProvider contextCheckAuthState] MANUALLY CALLED. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
        console.error('[AuthProvider contextCheckAuthState] Firebase Auth instance not available.');
        setLoading(false);
        return;
    }
    setLoading(true);
    console.log(`  [AuthProvider contextCheckAuthState] Set loading to TRUE.`);
    const currentFbUser = firebaseAuthInstance.currentUser;
    console.log(`  [AuthProvider contextCheckAuthState] firebaseAuthInstance.currentUser UID: ${currentFbUser?.uid || 'null'}`);
    setUser(currentFbUser);

    if (currentFbUser) {
        const profile = await fetchUserProfile(currentFbUser);
        setUserProfileState(profile);
    } else {
        setUserProfileState(null);
    }
    setLoading(false);
    console.log(`  [AuthProvider contextCheckAuthState] Set loading to FALSE. User: ${currentFbUser?.uid || 'null'}, Profile: ${!!userProfileState}`);
  }, [firebaseAuthInstance, fetchUserProfile]);

  const contextValue = useMemo(() => {
    const val = {
      user,
      userProfile,
      loading,
      logout: contextLogout,
      checkAuthState: contextCheckAuthState,
      setUserProfile: setUserProfileState,
    };
    console.log(`[AuthProvider RENDER/Memo] Timestamp: ${new Date().toISOString()}. Context: User UID: ${val.user?.uid || 'null'}, Loading: ${val.loading}, Profile ID: ${val.userProfile?.id || null}`);
    return val;
  }, [user, userProfile, loading, contextLogout, contextCheckAuthState]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
    