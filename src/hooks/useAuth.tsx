
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
  const [loading, setLoading] = useState(true); // Initialize loading to true

  const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser) => {
    console.log("[AuthProvider fetchUserProfile] Attempting to fetch profile for UID:", firebaseUser.uid);
    if (!db || !db.app) {
      console.warn("[AuthProvider fetchUserProfile] Firestore (db) is not initialized. Cannot fetch real profile.");
      setUserProfileState(null);
      return;
    }
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const profileData = userDocSnap.data() as UserProfile;
        setUserProfileState(profileData);
        console.log("[AuthProvider fetchUserProfile] User profile fetched and set for UID:", firebaseUser.uid);
      } else {
        console.warn("[AuthProvider fetchUserProfile] User profile not found in Firestore for UID:", firebaseUser.uid);
        setUserProfileState(null);
      }
    } catch (error) {
      console.error("[AuthProvider fetchUserProfile] Error fetching user profile for UID:", firebaseUser.uid, error);
      setUserProfileState(null);
    }
  }, []); // Empty dependency array as fetchUserProfile itself doesn't depend on changing values from this scope

  useEffect(() => {
    console.log("[AuthProvider useEffect] Setting up onAuthStateChanged listener.");
    if (!firebaseAuth || typeof firebaseAuth.onAuthStateChanged !== 'function') {
      console.warn('[AuthProvider useEffect] Firebase Auth is not initialized correctly. Setting loading to false.');
      setLoading(false); // Ensure loading becomes false if auth is broken
      setUser(null);
      setUserProfileState(null);
      return () => {}; // Return empty cleanup
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      // This callback fires on initial load AND any time the auth state changes (login, logout)
      console.log("[AuthProvider onAuthStateChanged] CALLBACK START. Current Firebase Auth User (UID if present):", firebaseAuth.currentUser ? firebaseAuth.currentUser.uid : 'null');
      setLoading(true); // Crucial: Set loading to true at the START of processing any auth event
      console.log("[AuthProvider onAuthStateChanged] setLoading(true) called.");
      console.log("[AuthProvider onAuthStateChanged] Received firebaseUser (UID if present) from listener:", firebaseUser ? firebaseUser.uid : 'null');
      
      if (firebaseUser) {
        console.log("[AuthProvider onAuthStateChanged] FirebaseUser IS TRUTHY. UID:", firebaseUser.uid);
        setUser(firebaseUser); // Set user immediately
        console.log("[AuthProvider onAuthStateChanged] setUser(firebaseUser) called. Profile fetch starting for UID:", firebaseUser.uid);
        await fetchUserProfile(firebaseUser); // This will call setUserProfileState internally
        console.log("[AuthProvider onAuthStateChanged] fetchUserProfile completed for UID:", firebaseUser.uid);
      } else {
        console.log("[AuthProvider onAuthStateChanged] FirebaseUser IS FALSY. Setting user and profile to null.");
        setUser(null);
        setUserProfileState(null);
        console.log("[AuthProvider onAuthStateChanged] setUser(null) and setUserProfileState(null) called.");
      }
      
      setLoading(false); // Crucial: Set loading to false at the VERY END of processing this auth event
      console.log("[AuthProvider onAuthStateChanged] CALLBACK END. setLoading(false) called.");
    });

    return () => {
      console.log("[AuthProvider useEffect] Unsubscribing from onAuthStateChanged.");
      unsubscribe();
    };
  }, [fetchUserProfile]); // fetchUserProfile is stable due to useCallback

  const logout = async () => {
    console.log("[AuthProvider logout] Logging out user.");
    if (firebaseAuth && typeof firebaseAuth.signOut === 'function') {
      await signOut(firebaseAuth);
      // onAuthStateChanged will handle setting user to null and updating loading state.
    } else {
      console.warn('[AuthProvider logout] Firebase Auth is not initialized. Cannot sign out.');
      // Manually update state if auth is broken
      setLoading(true);
      setUser(null);
      setUserProfileState(null);
      setLoading(false);
    }
    console.log("[AuthProvider logout] Logout process complete.");
  };
  
  const checkAuthState = useCallback(async () => {
    console.log("[AuthProvider checkAuthState] Manually checking auth state.");
    setLoading(true);
    const fbUser = firebaseAuth?.currentUser;
    if (fbUser) {
        console.log("[AuthProvider checkAuthState] Current user found:", fbUser.uid);
        setUser(fbUser);
        await fetchUserProfile(fbUser);
    } else {
        console.log("[AuthProvider checkAuthState] No current user.");
        setUser(null);
        setUserProfileState(null);
    }
    setLoading(false);
    console.log("[AuthProvider checkAuthState] Finished.");
  }, [fetchUserProfile]);

  console.log("[AuthProvider RENDER] Context being provided: User UID:", user ? user.uid : 'null', "Loading:", loading, "Profile ID:", userProfile ? userProfile.id : 'null', "Last Logged In:", userProfile?.lastLoggedInDate || 'N/A');

  return (
    <AuthContext.Provider value={{ user, userProfile, setUserProfile: setUserProfileState, loading, logout, checkAuthState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
