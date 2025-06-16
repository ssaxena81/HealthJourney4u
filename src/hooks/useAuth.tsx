
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';
import { setCookie, eraseCookie } from '@/lib/cookie-utils';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUserProfile?: (profileUpdater: (prev: UserProfile | null) => UserProfile | null) => void;
  checkAuthState?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const initialLogTimestamp = useMemo(() => new Date().toISOString(), []);
  console.log(`[AuthProvider BODY START] Timestamp: ${initialLogTimestamp}`);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Start as true

  console.log(`  [AuthProvider State Init] User: ${user?.uid || 'null'}, Loading: ${loading}. firebaseAuthInstance available: ${!!firebaseAuthInstance}`);

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
    } catch (e: any) {
      console.error(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Error fetching profile for ${fbUser.uid}:`, e.message, e.stack);
      return null;
    }
  }, []); // db is stable

  useEffect(() => {
    const effectExecutionTime = new Date().toISOString();
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${effectExecutionTime}`);
    
    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect @ ${effectExecutionTime}] Firebase Auth instance not available. Setting loading to false and erasing cookie.`);
      setLoading(false);
      eraseCookie('auth_sync_complete'); // Ensure cookie is cleared if auth can't init
      return;
    }
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] firebaseAuthInstance in effect: true. Subscribing to onAuthStateChanged...`);

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      const callbackTime = new Date().toISOString();
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK START] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${callbackTime}`);
      
      console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Immediately setting loading to TRUE.`);
      setLoading(true);

      if (fbUser) {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fbUser IS PRESENT (UID: ${fbUser.uid}). Calling setUser...`);
        setUser(fbUser);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] setUser called. Now attempting to fetch profile for UID: ${fbUser.uid}...`);
        
        let profile: UserProfile | null = null;
        try {
          profile = await fetchUserProfile(fbUser);
          console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fetchUserProfile completed for UID: ${fbUser.uid}. Profile ${profile ? 'found' : 'NOT found'}.`);
        } catch (fetchError) {
            console.error(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fetchUserProfile THREW AN ERROR for UID ${fbUser.uid}:`, fetchError);
        }
        
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Calling setUserProfileState for UID: ${fbUser.uid}...`);
        setUserProfileState(profile);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] setUserProfileState called. Profile was ${profile ? 'set' : 'set to null'}.`);
        
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Attempting to set auth_sync_complete cookie for UID: ${fbUser.uid}.`);
        setCookie('auth_sync_complete', 'true', 1); // Cookie expires in 1 day
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] auth_sync_complete cookie SET.`);

      } else {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fbUser IS NULL.`);
        setUser(null);
        setUserProfileState(null);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User and profile states cleared. Attempting to erase auth_sync_complete cookie.`);
        eraseCookie('auth_sync_complete');
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] auth_sync_complete cookie ERASED.`);
      }
      
      // This log will show the state of fbUser that triggered this specific setLoading(false)
      const currentContextUserUID = user?.uid; // Capture current user from state at this point.
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK END @ ${new Date().toISOString()}] Setting loading to FALSE. Triggering fbUser was: ${fbUser?.uid || 'null'}. Context user state before this setLoading(false): ${currentContextUserUID || 'null'}.`);
      setLoading(false);
    });

    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] Listener SUBSCRIBED.`);
    
    return () => {
      const cleanupTime = new Date().toISOString();
      console.log(`[AuthProvider useEffect for onAuthStateChanged] CLEANING UP LISTENER. Timestamp: ${cleanupTime}`);
      unsubscribe();
    };
  }, [fetchUserProfile]); // firebaseAuthInstance is module-scoped, db is in fetchUserProfile's closure.

  const contextLogout = useCallback(async () => {
    const logoutStartTime = new Date().toISOString();
    console.log(`[AuthProvider contextLogout @ ${logoutStartTime}] Called.`);
    eraseCookie('auth_sync_complete');
    if (firebaseAuthInstance) {
      try {
        // setLoading(true); // onAuthStateChanged will handle loading state on user change
        await signOut(firebaseAuthInstance);
        // onAuthStateChanged will be triggered with null, which handles setUser(null), setUserProfileState(null), and setLoading
        console.log(`  [AuthProvider contextLogout @ ${new Date().toISOString()}] signOut successful. onAuthStateChanged will handle state updates.`);
      } catch (error) {
        console.error("  [AuthProvider contextLogout] Error signing out:", error);
        setUser(null); // Fallback state clearing
        setUserProfileState(null);
        setLoading(false); // Fallback loading state
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
    const currentFbUser = firebaseAuthInstance.currentUser;
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
    console.log("[AuthProvider checkAuthState] Manual re-check complete. User:", currentFbUser?.uid || 'null');
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

    