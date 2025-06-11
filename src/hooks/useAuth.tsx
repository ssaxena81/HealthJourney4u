
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuth, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

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
    console.log("[AuthProvider fetchUserProfile] Attempting to fetch profile for UID:", firebaseUser.uid);
    if (!db || !db.app) {
      console.warn("[AuthProvider fetchUserProfile] Firestore (db) is not initialized. Cannot fetch real profile.");
      setUserProfile(null); 
      return;
    }

    try {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const profileData = userDocSnap.data() as UserProfile;
          setUserProfile(profileData);
          console.log("[AuthProvider fetchUserProfile] User profile fetched from Firestore:", profileData);
        } else {
          console.warn("[AuthProvider fetchUserProfile] User profile not found in Firestore for UID:", firebaseUser.uid);
          setUserProfile(null); 
        }
    } catch (error) {
        console.error("[AuthProvider fetchUserProfile] Error fetching user profile from Firestore:", error);
        setUserProfile(null);
    }
  }, []);


  useEffect(() => {
    console.log("[AuthProvider useEffect] Setting up onAuthStateChanged listener.");
    if (firebaseAuth && typeof firebaseAuth.onAuthStateChanged === 'function') {
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        setLoading(true); // START loading state
        console.log("[AuthProvider onAuthStateChanged] Auth state changed. FirebaseUser:", firebaseUser ? firebaseUser.uid : 'null', "Current loading state:", loading);
        
        if (firebaseUser) {
          console.log("[AuthProvider onAuthStateChanged] User is present. Setting user and fetching profile.");
          setUser(firebaseUser);
          await fetchUserProfile(firebaseUser);
        } else {
          console.log("[AuthProvider onAuthStateChanged] User is null. Clearing user and profile.");
          setUser(null);
          setUserProfile(null);
        }
        setLoading(false); // END loading state after all processing
        console.log("[AuthProvider onAuthStateChanged] Finished processing. Loading set to false. Final user:", user ? user.uid : 'null', "Final profile:", userProfile ? userProfile.id : 'null');
      });
      return () => {
        console.log("[AuthProvider useEffect] Unsubscribing from onAuthStateChanged.");
        unsubscribe();
      };
    } else {
      console.warn(
        '[AuthProvider useEffect] Firebase Auth is not initialized correctly. Cannot subscribe to auth state changes.'
      );
      setLoading(false); 
      setUser(null);
      setUserProfile(null);
      return () => {};
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUserProfile]);

  const checkAuthState = useCallback(async () => {
    console.log("[AuthProvider checkAuthState] Manually checking auth state.");
    setLoading(true);
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
      setUser(null);
      setUserProfile(null);
    }
    setLoading(false);
    console.log("[AuthProvider checkAuthState] Finished. Loading set to false.");
  }, [fetchUserProfile]);

  const logout = async () => {
    console.log("[AuthProvider logout] Logging out user.");
    if (firebaseAuth && typeof firebaseAuth.signOut === 'function') {
      await signOut(firebaseAuth);
      // onAuthStateChanged will handle setting user, userProfile to null and loading to false.
      // Explicitly setting user/profile to null here can be redundant if onAuthStateChanged fires quickly,
      // but doesn't hurt as a safeguard for immediate UI update.
      setUser(null);
      setUserProfile(null);
    } else {
      console.warn('[AuthProvider logout] Firebase Auth is not initialized. Cannot sign out.');
      setUser(null); 
      setUserProfile(null);
    }
    console.log("[AuthProvider logout] Logout process complete.");
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, setUserProfile, loading, logout, checkAuthState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

