
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth'; // Added signOut back
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>; // Added logout back
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  console.log(`[AuthProvider MINIMAL-REVERT BODY START] Timestamp: ${new Date().toISOString()}`);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Start true

  console.log(`  [AuthProvider MINIMAL-REVERT State Init] firebaseAuthInstance available: ${!!firebaseAuthInstance}, db available: ${!!db}`);

  useEffect(() => {
    console.log(`[AuthProvider MINIMAL-REVERT useEffect for Listener] EXECUTING EFFECT. Timestamp: ${new Date().toISOString()}`);
    console.log(`  [AuthProvider MINIMAL-REVERT useEffect] firebaseAuthInstance in effect: ${!!firebaseAuthInstance}`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider MINIMAL-REVERT useEffect] Firebase Auth instance NOT READY. Setting loading false.`);
      setLoading(false);
      return;
    }

    console.log(`  [AuthProvider MINIMAL-REVERT useEffect] Subscribing to onAuthStateChanged...`);
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log(`  [AuthProvider MINIMAL-REVERT onAuthStateChanged CALLBACK START] User UID: ${fbUser?.uid || 'null'}`);
      setLoading(true);
      if (fbUser) {
        setUser(fbUser);
        if (db) {
          try {
            console.log(`    [AuthProvider MINIMAL-REVERT onAuthStateChanged] Fetching profile for ${fbUser.uid}`);
            const profileSnap = await getDoc(doc(db, "users", fbUser.uid));
            if (profileSnap.exists()) {
              setUserProfileState(profileSnap.data() as UserProfile);
              console.log(`    [AuthProvider MINIMAL-REVERT onAuthStateChanged] Profile fetched for ${fbUser.uid}`);
            } else {
              setUserProfileState(null);
              console.log(`    [AuthProvider MINIMAL-REVERT onAuthStateChanged] No profile found for ${fbUser.uid}`);
            }
          } catch (e) {
            console.error("    [AuthProvider MINIMAL-REVERT onAuthStateChanged] Error fetching profile:", e);
            setUserProfileState(null);
          }
        } else {
           console.warn("    [AuthProvider MINIMAL-REVERT onAuthStateChanged] Firestore 'db' not available for profile fetch.");
           setUserProfileState(null);
        }
      } else {
        setUser(null);
        setUserProfileState(null);
        console.log(`  [AuthProvider MINIMAL-REVERT onAuthStateChanged] User is NULL.`);
      }
      setLoading(false);
      console.log(`  [AuthProvider MINIMAL-REVERT onAuthStateChanged CALLBACK END] Loading set to false.`);
    });

    console.log(`  [AuthProvider MINIMAL-REVERT useEffect] Listener SUBSCRIBED.`);
    return () => {
      console.log(`[AuthProvider MINIMAL-REVERT useEffect] CLEANING UP onAuthStateChanged listener.`);
      unsubscribe();
    };
  }, []); // Empty dependency array: run once on mount.

  const contextLogout = async () => { // Added logout back
    console.log(`[AuthProvider MINIMAL-REVERT contextLogout] Called.`);
    if (firebaseAuthInstance) {
      await signOut(firebaseAuthInstance);
    } else {
      console.error("[AuthProvider MINIMAL-REVERT contextLogout] Firebase Auth instance not available.");
    }
  };

  const contextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    logout: contextLogout, // Added logout back
  }), [user, userProfile, loading]);

  console.log(`[AuthProvider MINIMAL-REVERT RENDER] Loading: ${loading}, User: ${user?.uid || 'null'}`);
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
