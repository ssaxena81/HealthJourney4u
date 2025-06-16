
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';
import { setCookie, eraseCookie } from '@/lib/cookie-utils'; // Import cookie utils

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUserProfile?: (profileUpdater: (prev: UserProfile | null) => UserProfile | null) => void;
  checkAuthState?: () => Promise<void>; // Added for explicit re-check if needed
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const initialLogTimestamp = useMemo(() => new Date().toISOString(), []);
  console.log(`[AuthProvider BODY START] Timestamp: ${initialLogTimestamp}`);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Start as true

  console.log(`  [AuthProvider State Init @ ${initialLogTimestamp}] User: ${user?.uid || 'null'}, Loading: ${loading}. firebaseAuthInstance: ${!!firebaseAuthInstance}`);

  const fetchUserProfile = useCallback(async (fbUser: FirebaseUser): Promise<UserProfile | null> => {
    const fetchProfileTimestamp = new Date().toISOString();
    console.log(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Called for UID: ${fbUser.uid}. DB available: ${!!db}`);
    if (!db) {
      console.error("    [AuthProvider fetchUserProfile] Firestore 'db' instance is not available.");
      return null;
    }
    try {
      const profileSnap = await getDoc(doc(db, "users", fbUser.uid));
      if (profileSnap.exists()) {
        const profileData = profileSnap.data() as UserProfile;
        console.log(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Profile fetched for ${fbUser.uid}. Setup complete: ${profileData.profileSetupComplete}`);
        return profileData;
      } else {
        console.warn(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] No profile found for ${fbUser.uid}.`);
        return null;
      }
    } catch (e) {
      console.error(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Error fetching profile for ${fbUser.uid}:`, e);
      return null;
    }
  }, []); // db is stable from module scope

  useEffect(() => {
    const effectExecutionTime = new Date().toISOString();
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${effectExecutionTime}`);
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] firebaseAuthInstance in effect: ${!!firebaseAuthInstance}`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect @ ${effectExecutionTime}] Firebase Auth instance not available. Setting loading to false.`);
      setLoading(false);
      eraseCookie('auth_sync_complete');
      return;
    }

    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] Subscribing to onAuthStateChanged...`);
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      const callbackTime = new Date().toISOString();
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK START] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${callbackTime}`);
      
      setLoading(true);
      console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Set loading to TRUE.`);

      if (fbUser) {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User IS PRESENT (UID: ${fbUser.uid}).`);
        setUser(fbUser);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User state set. Attempting to fetch profile...`);
        const profile = await fetchUserProfile(fbUser);
        setUserProfileState(profile);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User profile state set. Profile found: ${!!profile}. Setting auth_sync_complete cookie.`);
        setCookie('auth_sync_complete', 'true', 1); // Set cookie for 1 day
      } else {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User IS NULL.`);
        setUser(null);
        setUserProfileState(null);
        eraseCookie('auth_sync_complete'); // Erase cookie on logout/null user
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Cleared user, profile, and auth_sync_complete cookie.`);
      }
      
      setLoading(false);
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK END @ ${new Date().toISOString()}] Set loading to FALSE. Final context state - User: ${fbUser?.uid || 'null'}, Profile: ${!!userProfile}, Loading: false`);
    });

    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] Listener SUBSCRIBED.`);
    
    return () => {
      const cleanupTime = new Date().toISOString();
      console.log(`[AuthProvider useEffect for onAuthStateChanged] CLEANING UP LISTENER. Timestamp: ${cleanupTime}`);
      unsubscribe();
    };
  }, [fetchUserProfile]); // firebaseAuthInstance removed as it's stable module import

  const contextLogout = useCallback(async () => {
    const logoutStartTime = new Date().toISOString();
    console.log(`[AuthProvider contextLogout @ ${logoutStartTime}] Called.`);
    eraseCookie('auth_sync_complete'); // Ensure sync cookie is cleared on logout action
    if (firebaseAuthInstance) {
      try {
        setLoading(true);
        console.log(`  [AuthProvider contextLogout @ ${logoutStartTime}] Attempting Firebase signOut...`);
        await signOut(firebaseAuthInstance);
        // onAuthStateChanged will handle setting user to null, profile to null, and setLoading(false)
        console.log(`  [AuthProvider contextLogout @ ${new Date().toISOString()}] signOut successful.`);
      } catch (error) {
        console.error("  [AuthProvider contextLogout] Error signing out:", error);
        setUser(null); // Fallback if signOut fails or onAuthStateChanged doesn't fire
        setUserProfileState(null);
        setLoading(false);
      }
    } else {
      console.error("  [AuthProvider contextLogout] Firebase Auth instance not available.");
      setUser(null); setUserProfileState(null); setLoading(false);
    }
  }, []);

  const contextSetUserProfile = useCallback((updater: (prev: UserProfile | null) => UserProfile | null) => {
    console.log("[AuthProvider contextSetUserProfile] Manually updating profile in context via updater fn.");
    setUserProfileState(updater);
  }, []);
  
  const checkAuthState = useCallback(async () => {
    if (!firebaseAuthInstance) {
      console.warn("[AuthProvider checkAuthState] Firebase Auth instance not available.");
      setLoading(false);
      return;
    }
    console.log("[AuthProvider checkAuthState] Manually re-checking auth state...");
    setLoading(true);
    const currentFbUser = firebaseAuthInstance.currentUser; // Get current user synchronously
    if (currentFbUser) {
      setUser(currentFbUser);
      const profile = await fetchUserProfile(currentFbUser);
      setUserProfileState(profile);
      setCookie('auth_sync_complete', 'true', 1);
    } else {
      setUser(null);
      setUserProfileState(null);
      eraseCookie('auth_sync_complete');
    }
    setLoading(false);
    console.log("[AuthProvider checkAuthState] Manual re-check complete. User:", currentFbUser?.uid || null);
  }, [fetchUserProfile]);


  const contextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    logout: contextLogout,
    setUserProfile: contextSetUserProfile,
    checkAuthState,
  }), [user, userProfile, loading, contextLogout, contextSetUserProfile, checkAuthState]);

  const renderLogTimestamp = useMemo(() => new Date().toISOString(), [user, userProfile, loading]);
  console.log(`[AuthProvider RENDER/Memo @ ${renderLogTimestamp}] Context: User UID: ${contextValue.user?.uid || 'null'}, Loading: ${contextValue.loading}, Profile ID: ${contextValue.userProfile?.id || 'null'}`);

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
