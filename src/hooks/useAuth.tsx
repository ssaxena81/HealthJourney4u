
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
          console.log("[AuthProvider fetchUserProfile] User profile fetched and set for UID:", firebaseUser.uid, "Profile exists:", !!profileData);
        } else {
          console.warn("[AuthProvider fetchUserProfile] User profile not found in Firestore for UID:", firebaseUser.uid);
          setUserProfile(null); 
        }
    } catch (error) {
        console.error("[AuthProvider fetchUserProfile] Error fetching user profile from Firestore for UID:", firebaseUser.uid, error);
        setUserProfile(null);
    }
  }, []);


  useEffect(() => {
    console.log("[AuthProvider useEffect] Setting up onAuthStateChanged listener.");
    if (firebaseAuth && typeof firebaseAuth.onAuthStateChanged === 'function') {
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        console.log("[AuthProvider onAuthStateChanged] CALLBACK START. Current Firebase Auth User (UID if present):", firebaseAuth.currentUser ? firebaseAuth.currentUser.uid : 'null');
        console.log("[AuthProvider onAuthStateChanged] Received firebaseUser (UID if present) from listener:", firebaseUser ? firebaseUser.uid : 'null');
        
        setLoading(true); 
        console.log("[AuthProvider onAuthStateChanged] setLoading(true) called.");

        if (firebaseUser) {
          console.log("[AuthProvider onAuthStateChanged] FirebaseUser is TRUTHY. UID:", firebaseUser.uid);
          setUser(firebaseUser); 
          console.log("[AuthProvider onAuthStateChanged] setUser(firebaseUser) called. Profile fetch starting for UID:", firebaseUser.uid);
          await fetchUserProfile(firebaseUser);
          console.log("[AuthProvider onAuthStateChanged] fetchUserProfile completed for UID:", firebaseUser.uid);
        } else {
          console.log("[AuthProvider onAuthStateChanged] FirebaseUser is FALSY. Setting user and profile to null.");
          setUser(null);
          setUserProfile(null);
          console.log("[AuthProvider onAuthStateChanged] setUser(null) and setUserProfile(null) called.");
        }
        
        setLoading(false); 
        console.log("[AuthProvider onAuthStateChanged] CALLBACK END. setLoading(false) called.");
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
  }, [fetchUserProfile]);

  const checkAuthState = useCallback(async () => {
    console.log("[AuthProvider checkAuthState] Manually checking auth state (primarily uses onAuthStateChanged now).");
    setLoading(true);
    // onAuthStateChanged is the primary mechanism, this function is more of a utility
    // but direct currentUser access can be stale. Rely on the listener.
    if (firebaseAuth?.currentUser) {
        setUser(firebaseAuth.currentUser);
        await fetchUserProfile(firebaseAuth.currentUser);
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
      // onAuthStateChanged will handle setting user, userProfile to null.
    } else {
      console.warn('[AuthProvider logout] Firebase Auth is not initialized. Cannot sign out.');
      setUser(null); 
      setUserProfile(null);
      setLoading(false); // Ensure loading is false if auth is not init
    }
    console.log("[AuthProvider logout] Logout process complete.");
  };

  console.log("[AuthProvider RENDER] Context being provided: User UID:", user ? user.uid : 'null', "Loading:", loading, "Profile ID:", userProfile ? userProfile.id : 'null');

  return (
    <AuthContext.Provider value={{ user, userProfile, setUserProfile, loading, logout, checkAuthState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

