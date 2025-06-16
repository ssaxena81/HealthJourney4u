
'use client';

import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp'; // Ensure this is the client instance
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  console.log(`[AuthProvider BODY START] Timestamp: ${new Date().toISOString()}`);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Initialize to true

  console.log(`  [AuthProvider State Init] User: ${user?.uid || 'null'}, Loading: ${loading}. firebaseAuthInstance available: ${!!firebaseAuthInstance}. Timestamp: ${new Date().toISOString()}`);

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
    console.log(`[AuthProvider fetchUserProfile START] Called for UID: ${firebaseUser.uid}. Timestamp: ${new Date().toISOString()}`);
    if (!db) {
      console.error('[AuthProvider fetchUserProfile] Firestore (db) not initialized for profile fetch.');
      return null;
    }
    try {
      const userProfileDocRef = doc(db, 'users', firebaseUser.uid);
      const userProfileSnap = await getDoc(userProfileDocRef);
      if (userProfileSnap.exists()) {
        const profileData = userProfileSnap.data() as UserProfile;
        console.log(`  [AuthProvider fetchUserProfile SUCCESS] Profile FOUND for UID: ${firebaseUser.uid}. Profile Setup Complete: ${profileData.profileSetupComplete}. Timestamp: ${new Date().toISOString()}`);
        return profileData;
      } else {
        console.log(`  [AuthProvider fetchUserProfile NO_PROFILE] Profile NOT FOUND for UID: ${firebaseUser.uid}. Timestamp: ${new Date().toISOString()}`);
        return null;
      }
    } catch (error) {
      console.error(`[AuthProvider fetchUserProfile ERROR] Error fetching profile for UID ${firebaseUser.uid}:`, error, `Timestamp: ${new Date().toISOString()}`);
      return null;
    }
  }, []); // db is stable from module scope

  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${new Date().toISOString()}`);
    console.log(`  [AuthProvider useEffect] firebaseAuthInstance in effect: ${!!firebaseAuthInstance}`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect] Firebase Auth instance NOT READY. Setting loading false and returning. Timestamp: ${new Date().toISOString()}`);
      setLoading(false);
      return;
    }

    console.log(`  [AuthProvider useEffect] Subscribing to onAuthStateChanged... Timestamp: ${new Date().toISOString()}`);
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log(`[AuthProvider onAuthStateChanged CALLBACK START] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${new Date().toISOString()}`);
      console.log("  [AuthProvider onAuthStateChanged] Setting loading to TRUE.");
      setLoading(true); 

      if (fbUser) {
        console.log(`  [AuthProvider onAuthStateChanged] User is PRESENT (UID: ${fbUser.uid}). Setting user state.`);
        setUser(fbUser);
        console.log(`  [AuthProvider onAuthStateChanged] Calling fetchUserProfile for UID: ${fbUser.uid}.`);
        const profile = await fetchUserProfile(fbUser);
        console.log(`  [AuthProvider onAuthStateChanged] fetchUserProfile returned: ${profile ? `Profile for UID ${profile.id}` : 'null'}. Setting userProfile state.`);
        setUserProfileState(profile);
      } else {
        console.log(`  [AuthProvider onAuthStateChanged] User is NULL. Clearing user and userProfile states.`);
        setUser(null);
        setUserProfileState(null);
      }
      console.log("  [AuthProvider onAuthStateChanged] Setting loading to FALSE.");
      setLoading(false);
      // The console.log below might show a stale userProfileState if it was just set due to closure,
      // the RENDER/Memo log is more reliable for the final state seen by consumers.
      console.log(`[AuthProvider onAuthStateChanged CALLBACK END] fbUser: ${fbUser?.uid || 'null'}, Loading: false. Timestamp: ${new Date().toISOString()}`);
    });

    console.log(`  [AuthProvider useEffect] Listener SUBSCRIBED. Timestamp: ${new Date().toISOString()}`);
    return () => {
      console.log(`[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener. Timestamp: ${new Date().toISOString()}`);
      unsubscribe();
    };
  }, [fetchUserProfile]); // firebaseAuthInstance is stable from module scope, fetchUserProfile is memoized.

  const contextLogout = useCallback(async () => {
    console.log(`[AuthProvider contextLogout] Called. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextLogout] Firebase Auth instance not available for logout.");
      return;
    }
    try {
      // onAuthStateChanged will handle setting user to null and loading states.
      await signOut(firebaseAuthInstance);
      console.log("[AuthProvider contextLogout] signOut successful. onAuthStateChanged will handle state updates.");
    } catch (error) {
      console.error('[AuthProvider contextLogout] Logout error:', error, `Timestamp: ${new Date().toISOString()}`);
      // If signOut fails, ensure a consistent state by manually clearing and setting loading.
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
      setUserProfile: setUserProfileState, // Expose this for direct updates if ever needed
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
