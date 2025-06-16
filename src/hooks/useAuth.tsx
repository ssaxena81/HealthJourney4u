
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp'; // From clientApp.ts
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  console.log(`[AuthProvider BODY START] Timestamp: ${new Date().toISOString()}`);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Initialize to true

  console.log(`  [AuthProvider State Init] User: ${user?.uid || 'null'}, Loading: ${loading}. firebaseAuthInstance available: ${!!firebaseAuthInstance}`);

  const fetchUserProfile = useCallback(async (fbUser: FirebaseUser): Promise<UserProfile | null> => {
    console.log(`    [AuthProvider fetchUserProfile] Called for UID: ${fbUser.uid}. DB available: ${!!db}`);
    if (!db) {
      console.error("    [AuthProvider fetchUserProfile] Firestore 'db' instance is not available. Cannot fetch profile.");
      return null;
    }
    try {
      const profileSnap = await getDoc(doc(db, "users", fbUser.uid));
      if (profileSnap.exists()) {
        const profileData = profileSnap.data() as UserProfile;
        console.log(`    [AuthProvider fetchUserProfile] Profile fetched for ${fbUser.uid}. Profile setup complete: ${profileData.profileSetupComplete}`);
        return profileData;
      } else {
        console.log(`    [AuthProvider fetchUserProfile] No profile found for ${fbUser.uid}.`);
        return null;
      }
    } catch (e) {
      console.error(`    [AuthProvider fetchUserProfile] Error fetching profile for ${fbUser.uid}:`, e);
      return null;
    }
  }, []); // No dependencies, as `db` is from module scope

  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${new Date().toISOString()}`);
    console.log(`  [AuthProvider useEffect] firebaseAuthInstance in effect: ${!!firebaseAuthInstance}`);

    if (!firebaseAuthInstance) {
      console.warn("  [AuthProvider useEffect] Firebase Auth instance not available at effect execution. Setting loading to false and returning.");
      setLoading(false);
      return;
    }

    console.log(`  [AuthProvider useEffect] Subscribing to onAuthStateChanged...`);
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      const callbackTime = new Date().toISOString();
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK START] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${callbackTime}`);
      
      // Critical: Set loading to true as soon as an auth event begins processing
      setLoading(true); 
      console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Set loading to TRUE.`);

      if (fbUser) {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User IS PRESENT (UID: ${fbUser.uid}). Setting user state.`);
        setUser(fbUser);
        const profile = await fetchUserProfile(fbUser);
        setUserProfileState(profile);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User profile state set. Profile found: ${!!profile}`);
      } else {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User IS NULL. Clearing user and userProfile states.`);
        setUser(null);
        setUserProfileState(null);
      }
      
      setLoading(false);
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK END @ ${new Date().toISOString()}] Set loading to FALSE. Final context state for this event - User: ${fbUser?.uid || 'null'}, Profile: ${!!userProfileState}, Loading: false`);
    });

    console.log(`  [AuthProvider useEffect] Listener SUBSCRIBED.`);
    return () => {
      console.log(`[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener.`);
      unsubscribe();
    };
  }, [fetchUserProfile]); // Dependency on fetchUserProfile (memoized)

  const contextLogout = useCallback(async () => {
    console.log(`[AuthProvider contextLogout] Called.`);
    if (firebaseAuthInstance) {
      try {
        await signOut(firebaseAuthInstance);
        // onAuthStateChanged will be triggered by signOut, which will then handle
        // setting user to null, profile to null, and loading states appropriately.
        console.log(`[AuthProvider contextLogout] signOut successful. onAuthStateChanged will update context.`);
      } catch (error) {
        console.error("[AuthProvider contextLogout] Error signing out:", error);
        // Even on error, ensure state reflects logged out user if possible, or indicate error
        setUser(null);
        setUserProfileState(null);
        setLoading(false); // Ensure loading is false if signout fails to trigger onAuthStateChanged quickly
      }
    } else {
      console.error("[AuthProvider contextLogout] Firebase Auth instance not available for logout.");
      setUser(null); // Attempt to clear client state even if instance is missing
      setUserProfileState(null);
      setLoading(false);
    }
  }, []); // No dependencies as firebaseAuthInstance is from module scope

  const contextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    logout: contextLogout,
  }), [user, userProfile, loading, contextLogout]);

  console.log(`[AuthProvider RENDER/Memo] Timestamp: ${new Date().toISOString()}. Context: User UID: ${contextValue.user?.uid || 'null'}, Loading: ${contextValue.loading}, Profile ID: ${contextValue.userProfile?.id || 'null'}`);

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
