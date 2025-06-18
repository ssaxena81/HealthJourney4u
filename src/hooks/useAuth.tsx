
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile, AppAuthStateCookie } from '@/types';
import { doc, getDoc } from 'firebase/firestore';
import { setCookie, eraseCookie, getCookie } from '@/lib/cookie-utils'; // Added getCookie

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
        console.log(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Profile fetched for ${fbUser.uid}. Setup complete: ${profileData.profileSetupComplete}, isProfileCreated: ${profileData.isProfileCreated}`);
        return profileData;
      } else {
        console.warn(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] No profile found for ${fbUser.uid}.`);
        return null;
      }
    } catch (e: any) {
      console.error(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Error fetching profile for ${fbUser.uid}:`, e.message, e.stack);
      return null;
    }
  }, []);

  const processUserSession = useCallback(async (fbUser: FirebaseUser | null, source: string) => {
    const processTime = new Date().toISOString();
    console.log(`  [AuthProvider processUserSession FROM ${source} @ ${processTime}] START. Received fbUser UID: ${fbUser?.uid || 'null'}. Current loading state: ${loading}`);
    
    // setLoading(true); // Explicitly set loading, even if called from delayed check.
    // console.log(`    [AuthProvider processUserSession @ ${processTime}] setLoading(true) called.`);

    let newFirebaseUser: FirebaseUser | null = null;
    let newProfile: UserProfile | null = null;

    if (fbUser) {
      console.log(`    [AuthProvider processUserSession @ ${processTime}] fbUser IS PRESENT (UID: ${fbUser.uid}).`);
      newFirebaseUser = fbUser;
      try {
        newProfile = await fetchUserProfile(fbUser);
        console.log(`    [AuthProvider processUserSession @ ${processTime}] fetchUserProfile completed for UID: ${fbUser.uid}. Profile ${newProfile ? 'found' : 'NOT found'}.`);
      } catch (fetchError) {
          console.error(`    [AuthProvider processUserSession @ ${processTime}] fetchUserProfile THREW AN ERROR for UID ${fbUser.uid}:`, fetchError);
      }
    } else {
      console.log(`    [AuthProvider processUserSession @ ${processTime}] fbUser IS NULL.`);
    }

    setUser(newFirebaseUser);
    setUserProfileState(newProfile);
    console.log(`    [AuthProvider processUserSession @ ${processTime}] setUser and setUserProfileState called. User: ${newFirebaseUser?.uid || 'null'}, Profile: ${newProfile?.id || 'null'}`);

    if (newFirebaseUser && newProfile) {
      const cookieStateToSet: AppAuthStateCookie = {
          isProfileCreated: !!newProfile.profileSetupComplete,
          authSyncComplete: true
      };
      console.log(`    [AuthProvider processUserSession @ ${processTime}] Attempting to set app_auth_state cookie for UID: ${newFirebaseUser.uid} with state:`, cookieStateToSet);
      setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
      console.log(`    [AuthProvider processUserSession @ ${processTime}] app_auth_state cookie SET for user ${newFirebaseUser.uid}.`);
    } else {
      console.log(`    [AuthProvider processUserSession @ ${processTime}] No user or profile. Attempting to erase app_auth_state cookie.`);
      eraseCookie('app_auth_state');
      console.log(`    [AuthProvider processUserSession @ ${processTime}] app_auth_state cookie ERASED.`);
    }
    
    console.log(`  [AuthProvider processUserSession FROM ${source} @ ${new Date().toISOString()}] END. Setting loading to FALSE. fbUser was: ${fbUser?.uid || 'null'}.`);
    setLoading(false);
  }, [fetchUserProfile, loading]); // Added loading to deps


  useEffect(() => {
    const effectExecutionTime = new Date().toISOString();
    console.log(`[AuthProvider useEffect for onAuthStateChanged & Initial Check] EXECUTING EFFECT. Timestamp: ${effectExecutionTime}`);
    let isMounted = true;
    let initialCheckTimeout: NodeJS.Timeout | null = null;

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect @ ${effectExecutionTime}] Firebase Auth instance not available. Setting loading to false and erasing cookie.`);
      if (isMounted) {
        setUser(null);
        setUserProfileState(null);
        eraseCookie('app_auth_state');
        setLoading(false);
      }
      return;
    }
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] firebaseAuthInstance in effect: true. Subscribing to onAuthStateChanged...`);

    // Immediately set loading to true as we are about to check auth state
    setLoading(true);
    console.log(`    [AuthProvider useEffect @ ${effectExecutionTime}] setLoading(true) called at start of effect.`);


    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, (fbUser) => {
      if (!isMounted) return;
      if (initialCheckTimeout) clearTimeout(initialCheckTimeout); // Cancel delayed check if onAuthStateChanged fires first
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK @ ${new Date().toISOString()}] Listener FIRED. Processing user session.`);
      processUserSession(fbUser, 'onAuthStateChanged');
    });
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] onAuthStateChanged Listener SUBSCRIBED.`);

    // Fallback/Delayed Check:
    // This helps if onAuthStateChanged is slow to fire or if the initial state is already set
    // by Firebase (e.g., from persistence) before the listener is attached.
    initialCheckTimeout = setTimeout(() => {
        if (!isMounted) return;
        // Only run this if `user` is still null, meaning onAuthStateChanged hasn't populated it yet.
        // This check needs to be careful not to interfere if onAuthStateChanged has already processed a null user (logout).
        // We check current context's `user` state directly.
        // The current `user` in context might be stale if this timeout runs before `onAuthStateChanged` has updated it.
        // A better check is `firebaseAuthInstance.currentUser` IF `user` in context is still null.
        
        console.log(`  [AuthProvider DELAYED CHECK @ ${new Date().toISOString()}] Timeout reached. Checking firebaseAuthInstance.currentUser.`);
        const currentUserFromInstance = firebaseAuthInstance.currentUser;

        // If `user` state is still null (meaning onAuthStateChanged hasn't set a user yet)
        // AND firebaseAuthInstance.currentUser is now available (meaning session might have been picked up by Firebase client)
        // then process this user.
        if (user === null && currentUserFromInstance) {
            console.log(`    [AuthProvider DELAYED CHECK @ ${new Date().toISOString()}] Context 'user' is null, but firebaseAuthInstance.currentUser (UID: ${currentUserFromInstance.uid}) exists. Processing session.`);
            processUserSession(currentUserFromInstance, 'DelayedCheck');
        } else if (user === null && !currentUserFromInstance) {
            // If context user is null and instance current user is also null, it means no user is logged in.
            console.log(`    [AuthProvider DELAYED CHECK @ ${new Date().toISOString()}] Context 'user' is null, firebaseAuthInstance.currentUser is also null. No user session. Ensuring loading is false.`);
            processUserSession(null, 'DelayedCheck-NoUser'); // This will set loading to false
        } else if (user !== null) {
            // If context 'user' is already set, onAuthStateChanged likely already ran and handled it.
            // We still need to ensure loading becomes false if it hasn't already.
            console.log(`    [AuthProvider DELAYED CHECK @ ${new Date().toISOString()}] Context 'user' (UID: ${user.uid}) is already set. Assuming onAuthStateChanged handled it. Ensuring loading is false.`);
            if (loading) setLoading(false); // Ensure loading is false if onAuthStateChanged handled it but this timer also ran.
        }
    }, 200); // Small delay like 200ms

    return () => {
      isMounted = false;
      if (initialCheckTimeout) clearTimeout(initialCheckTimeout);
      const cleanupTime = new Date().toISOString();
      console.log(`[AuthProvider useEffect for onAuthStateChanged & Initial Check] CLEANING UP. Timestamp: ${cleanupTime}`);
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processUserSession]); // processUserSession is memoized with fetchUserProfile. User state is not directly in dep array to avoid re-running sub/unsub too often.

  const contextLogout = useCallback(async () => {
    const logoutStartTime = new Date().toISOString();
    console.log(`[AuthProvider contextLogout @ ${logoutStartTime}] Called.`);
    setLoading(true);
    eraseCookie('app_auth_state');
    if (firebaseAuthInstance) {
      try {
        await signOut(firebaseAuthInstance);
        console.log(`  [AuthProvider contextLogout @ ${new Date().toISOString()}] signOut successful. onAuthStateChanged will handle clearing user/profile state and setting loading to false.`);
        // onAuthStateChanged will set user to null, which will trigger processUserSession(null, ...)
      } catch (error) {
        console.error("  [AuthProvider contextLogout] Error signing out:", error);
        // Manually clear state and set loading false if signOut fails or onAuthStateChanged doesn't fire
        setUser(null);
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
    setUserProfileState(prevUserProfile => {
        const newProfile = updater(prevUserProfile);
        if (user) {
             const cookieStateToSet: AppAuthStateCookie = {
                isProfileCreated: !!newProfile?.profileSetupComplete,
                authSyncComplete: true
            };
            console.log(`    [AuthProvider contextSetUserProfile] Setting app_auth_state cookie with new profile state:`, cookieStateToSet);
            setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
        } else {
             console.log(`    [AuthProvider contextSetUserProfile] User not logged in, erasing app_auth_state cookie.`);
            eraseCookie('app_auth_state');
        }
        return newProfile;
    });
  }, [user]);

  const checkAuthState = useCallback(async () => {
    const checkAuthStartTime = new Date().toISOString();
    console.log(`[AuthProvider checkAuthState @ ${checkAuthStartTime}] Manually re-checking auth state...`);
    setLoading(true); // Signal that we are actively checking
    console.log(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] setLoading(true) called.`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] Firebase Auth instance not available.`);
      setUser(null); setUserProfileState(null);
      eraseCookie('app_auth_state');
      setLoading(false);
      console.log(`  [AuthProvider checkAuthState @ ${new Date().toISOString()}] setLoading(false) called due to no auth instance.`);
      return;
    }
    
    // Use firebaseAuthInstance.currentUser directly as onAuthStateChanged might be slightly delayed
    const currentFbUser = firebaseAuthInstance.currentUser; 
    await processUserSession(currentFbUser, 'checkAuthState');
    // processUserSession will handle setUser, setUserProfile, cookie, and setLoading(false)
    console.log(`[AuthProvider checkAuthState @ ${new Date().toISOString()}] Manual re-check requested processUserSession. User: ${currentFbUser?.uid || 'null'}`);

  }, [processUserSession]);


  const contextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    logout: contextLogout,
    setUserProfile: contextSetUserProfile,
    checkAuthState,
  }), [user, userProfile, loading, contextLogout, contextSetUserProfile, checkAuthState]);

  const renderLogTimestamp = useMemo(() => new Date().toISOString(), [user, userProfile, loading]);
  console.log(`[AuthProvider RENDER/Memo @ ${renderLogTimestamp}] Context: User UID: ${contextValue.user?.uid || 'null'}, Loading: ${contextValue.loading}, Profile ID: ${contextValue.userProfile?.id || 'null'}, isProfileCreated (context): ${contextValue.userProfile?.isProfileCreated}, profileSetupComplete (context): ${contextValue.userProfile?.profileSetupComplete}`);

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


    