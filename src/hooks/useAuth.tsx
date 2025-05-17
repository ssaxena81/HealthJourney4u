
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
        // Simulate fetching a more complete profile based on stored info or defaults
        // This mock profile should align with the UserProfile structure
        const mockProfileData: UserProfile = {
            id: firebaseUser.uid,
            email: firebaseUser.email || 'mock@example.com', // Ensure email is present
            subscriptionTier: 'free', // Default tier
            lastPasswordChangeDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
            acceptedLatestTerms: false, // Default, will trigger T&C modal
            firstName: "Mock", // Default
            lastName: "User", // Default
            dateOfBirth: new Date(1990, 0, 1).toISOString(), // Default
            cellPhone: undefined, // Default
            mfaMethod: undefined, // Default
            termsVersionAccepted: undefined, // Default
            paymentDetails: undefined, // Default
            connectedFitnessApps: [], // Default
            connectedDiagnosticsServices: [], // Default
            connectedInsuranceProviders: [], // Default
        };
        setUserProfile(mockProfileData);
    } else {
        setUserProfile(null);
    }
    // --- END MOCK PROFILE ---
  }, []);


  const checkAuthState = useCallback(async () => {
    setLoading(true);
    // Ensure firebaseAuth is valid before accessing currentUser
    if (firebaseAuth && typeof firebaseAuth.onAuthStateChanged === 'function') {
      const currentUser = firebaseAuth.currentUser;
      if (currentUser) {
        setUser(currentUser);
        await fetchUserProfile(currentUser);
      } else {
        setUser(null);
        setUserProfile(null);
      }
    } else {
      // Firebase Auth not properly initialized
      setUser(null);
      setUserProfile(null);
    }
    setLoading(false);
  }, [fetchUserProfile]);


  useEffect(() => {
    // Ensure firebaseAuth is a valid Auth instance and has onAuthStateChanged
    if (firebaseAuth && typeof firebaseAuth.onAuthStateChanged === 'function') {
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
    } else {
      // Firebase Auth is not properly initialized.
      console.warn(
        'Firebase Auth is not initialized correctly. Cannot subscribe to auth state changes. Please check your Firebase configuration in .env.local. Auth features will not work.'
      );
      setLoading(false);
      setUser(null);
      setUserProfile(null);
      // No unsubscribe needed as no subscription was made
      return () => {};
    }
  }, [fetchUserProfile]);

  const logout = async () => {
    setLoading(true);
    if (firebaseAuth && typeof firebaseAuth.signOut === 'function') {
      await signOut(firebaseAuth);
    } else {
      console.warn('Firebase Auth is not initialized. Cannot sign out.');
    }
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
