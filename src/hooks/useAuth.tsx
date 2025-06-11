
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
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser) => {
    console.log("[AuthProvider fetchUserProfile] Attempting to fetch profile for UID:", firebaseUser.uid);
    if (!db || !db.app) {
      console.warn("[AuthProvider fetchUserProfile] Firestore (db) is not initialized. Cannot fetch real profile.");
      setUserProfileState(null); // Ensure profile is cleared if DB not available
      return;
    }
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const profileData = userDocSnap.data() as UserProfile;
        setUserProfileState(profileData);
        console.log("[AuthProvider fetchUserProfile] User profile fetched and set for UID:", firebaseUser.uid, "Profile Data:", profileData);
      } else {
        console.warn("[AuthProvider fetchUserProfile] User profile not found in Firestore for UID:", firebaseUser.uid);
        setUserProfileState(null);
      }
    } catch (error) {
      console.error("[AuthProvider fetchUserProfile] Error fetching user profile for UID:", firebaseUser.uid, error);
      setUserProfileState(null);
    }
  }, []);

  useEffect(() => {
    console.log("[AuthProvider useEffect] SETTING UP onAuthStateChanged listener. Firebase Auth available:", !!firebaseAuth);
    if (!firebaseAuth || typeof firebaseAuth.onAuthStateChanged !== 'function') {
      console.warn('[AuthProvider useEffect] Firebase Auth is not initialized. Setting loading to false.');
      setLoading(false);
      setUser(null);
      setUserProfileState(null);
      return () => {};
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      // This log is CRITICAL to see if this callback is even triggered after login
      console.log("!!! [AuthProvider onAuthStateChanged FIRED] !!! FirebaseUser (from listener):", firebaseUser ? firebaseUser.uid : 'null');
      
      setLoading(true); // Set loading true at the start of processing this event
      console.log("[AuthProvider onAuthStateChanged] ==> setLoading(true) called.");

      if (firebaseUser) {
        console.log("[AuthProvider onAuthStateChanged] User IS authenticated. UID:", firebaseUser.uid);
        setUser(firebaseUser);
        console.log("[AuthProvider onAuthStateChanged] ==> setUser(firebaseUser) called for UID:", firebaseUser.uid);
        await fetchUserProfile(firebaseUser);
        console.log("[AuthProvider onAuthStateChanged] fetchUserProfile completed for UID:", firebaseUser.uid);
      } else {
        console.log("[AuthProvider onAuthStateChanged] User is NOT authenticated (firebaseUser is null/undefined).");
        setUser(null);
        setUserProfileState(null);
        console.log("[AuthProvider onAuthStateChanged] ==> setUser(null) and setUserProfileState(null) called.");
      }
      
      setLoading(false); // Set loading false at the end of processing this event
      console.log("[AuthProvider onAuthStateChanged] ==> setLoading(false) called. Final state - User UID:", firebaseUser ? firebaseUser.uid : 'null', "Loading:", false, "Profile Set:", !!userProfile);
    });

    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP onAuthStateChanged listener.");
      unsubscribe();
    };
  }, [fetchUserProfile]); // fetchUserProfile is stable due to useCallback

  console.log(
    "[AuthProvider RENDER] Context being provided: User UID:", user ? user.uid : 'null', 
    "Loading:", loading, 
    "Profile ID:", userProfile ? userProfile.id : 'null',
    "Last Logged In:", userProfile?.lastLoggedInDate || 'N/A'
  );

  return (
    <AuthContext.Provider value={{ user, userProfile, setUserProfile: setUserProfileState, loading, logout, checkAuthState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
