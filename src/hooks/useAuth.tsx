
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
  const [loading, setLoading] = useState(true); // Initialize loading to true for the initial check

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
          console.log("[AuthProvider fetchUserProfile] User profile fetched and set for UID:", firebaseUser.uid, "Profile content keys:", Object.keys(profileData || {}));
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
        
        if (firebaseUser) {
          console.log("[AuthProvider onAuthStateChanged] FirebaseUser IS TRUTHY. UID:", firebaseUser.uid);
          setUser(firebaseUser); 
          console.log("[AuthProvider onAuthStateChanged] setUser(firebaseUser) called. Profile fetch starting for UID:", firebaseUser.uid);
          await fetchUserProfile(firebaseUser);
          console.log("[AuthProvider onAuthStateChanged] fetchUserProfile completed for UID:", firebaseUser.uid);
        } else {
          console.log("[AuthProvider onAuthStateChanged] FirebaseUser IS FALSY. Setting user and profile to null.");
          setUser(null);
          setUserProfile(null);
          console.log("[AuthProvider onAuthStateChanged] setUser(null) and setUserProfile(null) called.");
        }
        
        // This ensures setLoading(false) is called only ONCE after the initial auth state is determined.
        // Subsequent auth changes (login/logout) will update `user` and `userProfile`, 
        // and components will re-render based on those context changes, not `loading`.
        if (loading) { 
            setLoading(false);
            console.log("[AuthProvider onAuthStateChanged] Initial auth state determined. setLoading(false).");
        }
        console.log("[AuthProvider onAuthStateChanged] CALLBACK END.");
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
  }, [fetchUserProfile]); // `loading` removed from dependency array to ensure it only affects initial load signal

  const checkAuthState = useCallback(async () => {
    console.log("[AuthProvider checkAuthState] Manually checking auth state.");
    // setLoading(true); // Don't set loading to true here, as onAuthStateChanged handles the main loading state
    if (firebaseAuth?.currentUser) {
        console.log("[AuthProvider checkAuthState] Current user found in firebaseAuth.currentUser:", firebaseAuth.currentUser.uid);
        setUser(firebaseAuth.currentUser);
        await fetchUserProfile(firebaseAuth.currentUser);
    } else {
        console.log("[AuthProvider checkAuthState] No current user in firebaseAuth.currentUser.");
        setUser(null);
        setUserProfile(null);
    }
    // If loading is still true from initial state, this means onAuthStateChanged hasn't fired yet.
    // However, this manual check might complete first. We ensure `loading` is set to false.
    if (loading) {
        setLoading(false);
        console.log("[AuthProvider checkAuthState] Setting loading to false after manual check.");
    }
    console.log("[AuthProvider checkAuthState] Finished.");
  }, [fetchUserProfile, loading]); // Keep loading here for the specific logic inside checkAuthState

  const logout = async () => {
    console.log("[AuthProvider logout] Logging out user.");
    if (firebaseAuth && typeof firebaseAuth.signOut === 'function') {
      await signOut(firebaseAuth);
      // onAuthStateChanged will handle setting user, userProfile to null and loading state appropriately.
    } else {
      console.warn('[AuthProvider logout] Firebase Auth is not initialized. Cannot sign out.');
      setUser(null); 
      setUserProfile(null);
      if (loading) setLoading(false); 
    }
    console.log("[AuthProvider logout] Logout process complete.");
  };

  console.log("[AuthProvider RENDER] Context being provided: User UID:", user ? user.uid : 'null', "Loading:", loading, "Profile ID:", userProfile ? userProfile.id : 'null', "Last Logged In:", userProfile?.lastLoggedInDate || 'N/A');

  return (
    <AuthContext.Provider value={{ user, userProfile, setUserProfile, loading, logout, checkAuthState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
