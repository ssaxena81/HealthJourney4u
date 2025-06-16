
'use client';

import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null; // Allow direct update
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  console.log(`[AuthProvider BODY START] Timestamp: ${new Date().toISOString()}`);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Start true until initial auth check completes

  console.log(`  [AuthProvider State Init] User: ${user?.uid || 'null'}, Loading: ${loading}. firebaseAuthInstance available: ${!!firebaseAuthInstance}`);

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
    console.log(`[AuthProvider fetchUserProfile] Called for UID: ${firebaseUser.uid}. Timestamp: ${new Date().toISOString()}`);
    if (!db) {
      console.error('[AuthProvider fetchUserProfile] Firestore (db) not initialized.');
      return null;
    }
    try {
      const userProfileDocRef = doc(db, 'users', firebaseUser.uid);
      const userProfileSnap = await getDoc(userProfileDocRef);
      if (userProfileSnap.exists()) {
        const profileData = userProfileSnap.data() as UserProfile;
        console.log(`  [AuthProvider fetchUserProfile] Profile FOUND for UID: ${firebaseUser.uid}. SetupComplete: ${profileData.profileSetupComplete}`);
        return profileData;
      } else {
        console.log(`  [AuthProvider fetchUserProfile] Profile NOT FOUND for UID: ${firebaseUser.uid}.`);
        return null;
      }
    } catch (error) {
      console.error(`[AuthProvider fetchUserProfile] Error fetching profile for UID ${firebaseUser.uid}:`, error);
      return null;
    }
  }, []); // db is stable

  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${new Date().toISOString()}`);
    console.log(`  [AuthProvider useEffect] firebaseAuthInstance in effect: ${!!firebaseAuthInstance}`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect] Firebase Auth instance NOT READY. Setting loading false and returning.`);
      setLoading(false); // Ensure loading stops if auth isn't available
      return;
    }

    console.log(`  [AuthProvider useEffect] Subscribing to onAuthStateChanged...`);
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log(`[AuthProvider onAuthStateChanged CALLBACK START] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${new Date().toISOString()}`);
      setLoading(true);
      console.log(`  [AuthProvider onAuthStateChanged] Set loading to TRUE.`);

      if (fbUser) {
        setUser(fbUser);
        console.log(`  [AuthProvider onAuthStateChanged] User state set (UID: ${fbUser.uid}). Fetching profile...`);
        const profile = await fetchUserProfile(fbUser);
        setUserProfileState(profile);
        console.log(`  [AuthProvider onAuthStateChanged] Profile fetched (result: ${profile ? 'found' : 'null'}). Set userProfile state.`);
      } else {
        setUser(null);
        setUserProfileState(null);
        console.log(`  [AuthProvider onAuthStateChanged] User is NULL. Cleared user and userProfile states.`);
      }
      setLoading(false);
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK END] Set loading to FALSE. Final context state - User: ${fbUser?.uid || 'null'}, Profile: ${!!userProfile}, Loading: false`);
    });

    console.log("  [AuthProvider useEffect] Listener SUBSCRIBED.");
    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener.");
      unsubscribe();
    };
  }, [fetchUserProfile]); // firebaseAuthInstance is stable from module scope

  const contextLogout = useCallback(async () => {
    console.log("[AuthProvider contextLogout] Called.");
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextLogout] Firebase Auth instance not available for logout.");
      return;
    }
    // onAuthStateChanged will handle setting user to null and loading states.
    try {
      await signOut(firebaseAuthInstance);
      console.log("[AuthProvider contextLogout] signOut successful.");
    } catch (error) {
      console.error('[AuthProvider contextLogout] Logout error:', error);
      // If signOut fails, onAuthStateChanged might not fire as expected, so ensure loading is false.
      setUser(null); 
      setUserProfileState(null);
      setLoading(false);
    }
  }, []); // firebaseAuthInstance is stable

  const contextValue = useMemo(() => {
    const val = {
      user,
      userProfile,
      loading,
      logout: contextLogout,
      setUserProfile: setUserProfileState,
    };
    console.log(`[AuthProvider RENDER/Memo] Timestamp: ${new Date().toISOString()}. Context: User UID: ${val.user?.uid || 'null'}, Loading: ${val.loading}, Profile ID: ${val.userProfile?.id || 'null'}`);
    return val;
  }, [user, userProfile, loading, contextLogout]);

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
