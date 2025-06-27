
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
// [2024-08-01] COMMENT: Added imports for Firestore persistence.
import { doc, getDoc, enableIndexedDbPersistence } from 'firebase/firestore';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  // This allows parts of the UI to optimistically update the profile state
  // without needing a full refetch, for a better user experience.
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // [2024-08-01] COMMENT: This new useEffect hook safely initializes Firestore persistence on the client-side.
  // [2024-08-01] COMMENT: This prevents potential build errors from running this logic at the module's top level.
  useEffect(() => {
    if (typeof window !== 'undefined' && db) {
        enableIndexedDbPersistence(db).catch((err) => {
            if (err.code === 'failed-precondition') {
            console.warn(
                'Firestore persistence failed: This can happen if you have multiple tabs open.'
            );
            } else if (err.code === 'unimplemented') {
            console.warn(
                'Firestore persistence failed: Browser does not support this feature.'
            );
            }
        });
    }
  }, []); // The empty dependency array ensures this runs only once on mount.


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      setLoading(true);
      if (fbUser) {
        setUser(fbUser);
        try {
          const profileSnap = await getDoc(doc(db, "users", fbUser.uid));
          if (profileSnap.exists()) {
            setUserProfile(profileSnap.data() as UserProfile);
          } else {
            console.warn("[AuthProvider] No profile document found for UID:", fbUser.uid);
            setUserProfile(null);
          }
        } catch (error) {
            console.error("[AuthProvider] Error fetching user profile:", error);
            setUserProfile(null);
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const logout = useCallback(async () => {
    await signOut(firebaseAuthInstance);
  }, []);

  const contextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    logout,
    setUserProfile,
  }), [user, userProfile, loading, logout]);

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
