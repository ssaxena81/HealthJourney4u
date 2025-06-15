
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth as firebaseAuthModule, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

const firebaseAuthInstance = firebaseAuthModule;

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> | null; // Kept for type consistency if needed later
  loading: boolean;
  logout: () => Promise<void>;
  // checkAuthState: () => Promise<void>; // Temporarily removed
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  setUserProfile: null,
  loading: true,
  logout: async () => { console.error("AuthContext: Default logout stub executed."); },
  // checkAuthState: async () => { console.error("AuthContext: Default checkAuthState stub executed."); }
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  console.log(`[AuthProvider BODY START] Component rendering. Timestamp: ${new Date().toISOString()}`);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null); // Renamed to avoid conflict
  const [loading, setLoading] = useState(true); // Initialize loading to true

  console.log(`[AuthProvider State Init] user: ${user?.uid || 'null'}, loading: ${loading}. Timestamp: ${new Date().toISOString()}`);
  console.log(`  firebaseAuthInstance (from clientApp.ts) available at AuthProvider module scope: ${!!firebaseAuthInstance}`);

  // Simplified logout for this test
  const simpleLogout = useCallback(async () => {
    console.log(`[AuthProvider simpleLogout] Called. Timestamp: ${new Date().toISOString()}`);
    if (!firebaseAuthInstance) {
      console.error("[AuthProvider simpleLogout] Firebase Auth instance unavailable.");
      return;
    }
    try {
      await signOut(firebaseAuthInstance);
    } catch (error) {
      console.error("[AuthProvider simpleLogout] Error during signOut:", error);
    }
  }, []);


  useEffect(() => {
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${new Date().toISOString()}`);
    
    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect] Firebase Auth instance NOT READY. Listener NOT set up. Setting loading to false.`);
      setLoading(false);
      return;
    }
    console.log(`  [AuthProvider useEffect] Subscribing to onAuthStateChanged...`);

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log(`[AuthProvider onAuthStateChanged CALLBACK FIRED] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${new Date().toISOString()}`);
      setLoading(true); 
      console.log(`  [onAuthStateChanged Callback] Set loading to TRUE.`);

      if (fbUser) {
        setUser(fbUser);
        console.log(`  [onAuthStateChanged Callback] User state set. Attempting to fetch profile for UID: ${fbUser.uid}`);
        // Basic profile fetch for testing
        if (db) {
            try {
                const userDocRef = doc(db, "users", fbUser.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const profileData = userDocSnap.data() as UserProfile;
                    setUserProfileState(profileData);
                    console.log(`  [onAuthStateChanged Callback] Profile fetched & set for UID: ${fbUser.uid}`);
                } else {
                    setUserProfileState(null);
                    console.log(`  [onAuthStateChanged Callback] Profile NOT FOUND for UID: ${fbUser.uid}`);
                }
            } catch (profileError) {
                console.error(`  [onAuthStateChanged Callback] Error fetching profile:`, profileError);
                setUserProfileState(null);
            }
        } else {
            console.warn("  [onAuthStateChanged Callback] Firestore (db) not available for profile fetch.");
            setUserProfileState(null);
        }
      } else {
        setUser(null);
        setUserProfileState(null);
        console.log("  [onAuthStateChanged Callback] User is NULL. Reset user and profile state.");
      }
      setLoading(false);
      console.log("  [onAuthStateChanged Callback] All async operations complete. Set loading to FALSE.");
    });

    console.log("  [AuthProvider useEffect] Listener SUBSCRIBED successfully.");
    return () => {
      console.log("[AuthProvider useEffect] CLEANING UP listener.");
      unsubscribe();
    };
  }, []); // Empty dependency array: run once on mount

  const contextValue = useMemo(() => {
    return {
      user,
      userProfile,
      setUserProfile: setUserProfileState,
      loading,
      logout: simpleLogout, // Use simplified logout
    };
  }, [user, userProfile, loading, simpleLogout]);

  console.log(`[AuthProvider RENDER] Timestamp: ${new Date().toISOString()}. Context: User UID: ${contextValue.user?.uid || 'null'}, Loading: ${contextValue.loading}, Profile ID: ${contextValue.userProfile?.id || 'null'}`);
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
};
    
