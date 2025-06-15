
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthModule, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

// This is firebaseAuthModule from clientApp.ts
const firebaseAuthInstance = firebaseAuthModule;

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  setUserProfile: null,
  loading: true,
  logout: async () => { console.error("AuthContext: Default logout stub executed."); },
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  console.log(`[AuthProvider BODY START] Component rendering. Timestamp: ${new Date().toISOString()}`);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  console.log(`[AuthProvider State Init] user: ${user?.uid || 'null'}, loading: ${loading}. Timestamp: ${new Date().toISOString()}`);
  console.log(`  firebaseAuthInstance (from clientApp.ts) available at AuthProvider module scope: ${!!firebaseAuthInstance}`);

  console.log(`[AuthProvider LOG POINT PRE-CALLBACKS] Before useCallback definitions. Timestamp: ${new Date().toISOString()}`);

  const fetchUserProfile = useCallback(async (fbUser: FirebaseUser) => {
    console.log(`[AuthProvider fetchUserProfile] Called for UID: ${fbUser.uid}. Timestamp: ${new Date().toISOString()}`);
    if (!db) {
      console.warn("[AuthProvider fetchUserProfile] Firestore (db) is not initialized. Cannot fetch profile.");
      setUserProfileState(null);
      return null;
    }
    try {
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const profileData = userDocSnap.data() as UserProfile;
        console.log(`[AuthProvider fetchUserProfile] Profile fetched for UID: ${fbUser.uid}. Profile Data:`, JSON.stringify(profileData));
        setUserProfileState(profileData);
        return profileData;
      } else {
        console.warn(`[AuthProvider fetchUserProfile] Profile NOT FOUND in Firestore for UID: ${fbUser.uid}`);
        setUserProfileState(null);
        return null;
      }
    } catch (error) {
      console.error(`[AuthProvider fetchUserProfile] ERROR fetching profile for UID: ${fbUser.uid}`, error);
      setUserProfileState(null);
      return null;
    }
  }, []);

  const contextLogout = useCallback(async () => {
    console.log(`[AuthProvider contextLogout] Called. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider contextLogout] Firebase Auth instance unavailable for logout.");
      setLoading(true); setUser(null); setUserProfileState(null); setLoading(false);
      return;
    }
    try {
      await signOut(firebaseAuthInstance);
      console.log("[AuthProvider contextLogout] signOut successful. onAuthStateChanged should handle context updates.");
    } catch (error) {
      console.error("[AuthProvider contextLogout] Error during signOut:", error);
      setLoading(true); setUser(null); setUserProfileState(null); setLoading(false);
    }
  }, []);

  console.log(`[AuthProvider LOG POINT POST-CALLBACKS] After useCallback definitions. Timestamp: ${new Date().toISOString()}`);

  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${new Date().toISOString()}`);
    console.log(`  [AuthProvider useEffect] Checking firebaseAuthInstance INSIDE effect. Available: ${!!firebaseAuthInstance}, typeof onAuthStateChanged: ${typeof firebaseAuthModule?.onAuthStateChanged}`);

    if (!firebaseAuthInstance || typeof firebaseAuthInstance.onAuthStateChanged !== 'function') {
      console.warn(`  [AuthProvider useEffect] Firebase Auth instance or onAuthStateChanged function NOT READY INSIDE effect. Auth listener NOT set up. Setting loading to false.`);
      setUser(null);
      setUserProfileState(null);
      setLoading(false);
      return;
    }

    console.log(`  [AuthProvider useEffect] Subscribing to onAuthStateChanged...`);
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
        console.log(`[AuthProvider onAuthStateChanged CALLBACK FIRED] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${new Date().toISOString()}`);
        setLoading(true);
        console.log(`  [onAuthStateChanged Callback] Set loading to TRUE.`);

        if (fbUser) {
          console.log(`  [onAuthStateChanged Callback] User is PRESENT. UID: ${fbUser.uid}. Setting user state.`);
          setUser(fbUser);
          console.log(`  [onAuthStateChanged Callback] Calling fetchUserProfile for UID: ${fbUser.uid}`);
          await fetchUserProfile(fbUser);
        } else {
          console.log("  [onAuthStateChanged Callback] User is NULL. Resetting user and profile state.");
          setUser(null);
          setUserProfileState(null);
        }
        console.log("  [onAuthStateChanged Callback] All async operations complete. Setting loading to false.");
        setLoading(false);
      });
      console.log("  [AuthProvider useEffect] Listener SUBSCRIBED successfully.");
    } catch (e) {
      console.error("  [AuthProvider useEffect] CRITICAL ERROR during onAuthStateChanged subscription:", e);
      setUser(null);
      setUserProfileState(null);
      setLoading(false);
    }

    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP listener.");
      if (unsubscribe) {
        console.log("  [AuthProvider useEffect Cleanup] Calling unsubscribe().");
        unsubscribe();
      } else {
        console.log("  [AuthProvider useEffect Cleanup] No unsubscribe function to call (likely subscription failed).");
      }
    };
  }, []);

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
    