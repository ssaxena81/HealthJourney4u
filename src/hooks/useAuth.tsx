
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuth } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
// TODO: Import Firestore functions to fetch user profile: import { doc, getDoc } from 'firebase/firestore';
// TODO: Import db from firebase clientApp

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
  logout: async () => {},
  checkAuthState: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser) => {
    // TODO: Implement actual Firestore profile fetch
    // const userDocRef = doc(db, "users", firebaseUser.uid);
    // const userDocSnap = await getDoc(userDocRef);
    // if (userDocSnap.exists()) {
    //   setUserProfile(userDocSnap.data() as UserProfile);
    // } else {
    //   // Profile might not be created yet (e.g., mid-signup) or an error
    //   console.warn("User profile not found in Firestore for UID:", firebaseUser.uid);
    //   setUserProfile(null); // Or a default/partial profile
    // }
    // --- MOCK PROFILE ---
    if (firebaseUser) {
        setUserProfile({
            id: firebaseUser.uid,
            email: firebaseUser.email || 'mock@example.com',
            subscriptionTier: 'free',
            lastPasswordChangeDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
            acceptedLatestTerms: false,
            firstName: "Mock",
            lastName: "User",
            connectedFitnessApps: [],
            connectedDiagnosticsServices: [],
            connectedInsuranceProviders: [],
        });
    } else {
        setUserProfile(null);
    }
    // --- END MOCK PROFILE ---
  }, []);


  const checkAuthState = useCallback(async () => {
    setLoading(true);
    const currentUser = firebaseAuth.currentUser;
    if (currentUser) {
      setUser(currentUser);
      await fetchUserProfile(currentUser);
    } else {
      setUser(null);
      setUserProfile(null);
    }
    setLoading(false);
  }, [fetchUserProfile]);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        await fetchUserProfile(firebaseUser);
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserProfile]);

  const logout = async () => {
    setLoading(true);
    await signOut(firebaseAuth);
    setUser(null);
    setUserProfile(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, setUserProfile, loading, logout, checkAuthState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
