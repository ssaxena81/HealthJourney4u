
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore'; // Ensure getDoc is imported

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
    if (!db || !db.app) {
      console.warn("[AuthProvider] Firestore (db) is not initialized. Cannot fetch real profile. Falling back to mock if user exists.");
       if (firebaseUser) {
        const mockProfileData: UserProfile = {
            id: firebaseUser.uid,
            email: firebaseUser.email || 'mock@example.com',
            subscriptionTier: 'free', 
            lastPasswordChangeDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
            acceptedLatestTerms: false,
            firstName: "Mock",
            lastName: "User",
            dateOfBirth: new Date(1990, 0, 1).toISOString(),
            cellPhone: undefined,
            // mfaMethod: undefined, // Removed as it's not in UserProfile type
            termsVersionAccepted: undefined,
            paymentDetails: undefined,
            connectedFitnessApps: [],
            connectedDiagnosticsServices: [],
            connectedInsuranceProviders: [],
        };
        setUserProfile(mockProfileData);
      } else {
        setUserProfile(null);
      }
      return;
    }

    try {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUserProfile(userDocSnap.data() as UserProfile);
          console.log("[AuthProvider] User profile fetched from Firestore for UID:", firebaseUser.uid);
        } else {
          console.warn("[AuthProvider] User profile not found in Firestore for UID:", firebaseUser.uid, ". This might be okay during initial signup flow.");
          setUserProfile(null); 
        }
    } catch (error) {
        console.error("[AuthProvider] Error fetching user profile from Firestore for UID:", firebaseUser.uid, error);
        setUserProfile(null); // Set to null on error to avoid inconsistent state
    }
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
