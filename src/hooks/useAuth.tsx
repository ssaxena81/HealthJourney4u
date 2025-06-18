
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile, AppAuthStateCookie } from '@/types';
import { doc, getDoc } from 'firebase/firestore';
import { setCookie, eraseCookie, getCookie } from '@/lib/cookie-utils';

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
    console.log(`  [AuthProvider processUserSession FROM ${source} @ ${processTime}] START. Received fbUser UID: ${fbUser?.uid || 'null'}.`);
    
    // setLoading(true) is managed by the calling effect/function (useEffect for onAuthStateChanged, or checkAuthState)

    let newFirebaseUser: FirebaseUser | null = null;
    let newProfile: UserProfile | null = null;

    if (fbUser) {
      console.log(`    [AuthProvider processUserSession @ ${processTime}] fbUser IS PRESENT (UID: ${fbUser.uid}). Attempting to fetch profile.`);
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
          isProfileCreated: !!newProfile.profileSetupComplete, // Use profileSetupComplete for this cookie flag
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
    
    console.log(`  [AuthProvider processUserSession FROM ${source} @ ${new Date().toISOString()}] END. Setting loading to FALSE.`);
    setLoading(false); // setLoading(false) is now the last step of processUserSession
  }, [fetchUserProfile]); // Removed 'loading' from deps as it's managed within this flow


  useEffect(() => {
    const effectExecutionTime = new Date().toISOString();
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${effectExecutionTime}`);
    let isMounted = true;

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect @ ${effectExecutionTime}] Firebase Auth instance not available. Setting user/profile to null, loading to false, and erasing cookie.`);
      if (isMounted) { // Check isMounted before setting state
        setUser(null);
        setUserProfileState(null);
        eraseCookie('app_auth_state');
        setLoading(false);
      }
      return;
    }
    
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] firebaseAuthInstance is available. Setting loading to true and subscribing to onAuthStateChanged...`);
    setLoading(true); // Set loading to true at the start of the effect

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      if (!isMounted) {
        console.log(`  [AuthProvider onAuthStateChanged CALLBACK @ ${new Date().toISOString()}] Listener FIRED but component unmounted. Aborting.`);
        return;
      }
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK @ ${new Date().toISOString()}] Listener FIRED. Calling processUserSession. Current loading state: ${loading}`); // Log current loading
      // setLoading(true) is already called at the start of useEffect.
      // processUserSession will set it to false when it's done.
      await processUserSession(fbUser, 'onAuthStateChanged');
    });
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] onAuthStateChanged Listener SUBSCRIBED.`);

    return () => {
      isMounted = false;
      const cleanupTime = new Date().toISOString();
      console.log(`[AuthProvider useEffect for onAuthStateChanged] CLEANING UP. Timestamp: ${cleanupTime}`);
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processUserSession]); // processUserSession is memoized.

  const contextLogout = useCallback(async () => {
    const logoutStartTime = new Date().toISOString();
    console.log(`[AuthProvider contextLogout @ ${logoutStartTime}] Called.`);
    setLoading(true);
    console.log(`  [AuthProvider contextLogout @ ${logoutStartTime}] setLoading(true) called.`);
    eraseCookie('app_auth_state');
    if (firebaseAuthInstance) {
      try {
        await signOut(firebaseAuthInstance);
        console.log(`  [AuthProvider contextLogout @ ${new Date().toISOString()}] signOut successful. onAuthStateChanged will handle state updates and set loading to false.`);
        // onAuthStateChanged will call processUserSession(null, ...), which sets loading to false.
      } catch (error) {
        console.error("  [AuthProvider contextLogout] Error signing out:", error);
        // Manually clear state and set loading false if signOut fails or onAuthStateChanged doesn't fire quickly enough
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
    const setProfileTime = new Date().toISOString();
    console.log(`[AuthProvider contextSetUserProfile @ ${setProfileTime}] Manually updating profile in context via updater fn.`);
    setUserProfileState(prevUserProfile => {
        const newProfile = updater(prevUserProfile);
        if (user && newProfile) { // Ensure user and newProfile exist before setting cookie
             const cookieStateToSet: AppAuthStateCookie = {
                isProfileCreated: !!newProfile.profileSetupComplete,
                authSyncComplete: true
            };
            console.log(`    [AuthProvider contextSetUserProfile @ ${setProfileTime}] Setting app_auth_state cookie with new profile state:`, cookieStateToSet);
            setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
        } else if (!user) { // If no user, erase cookie
             console.log(`    [AuthProvider contextSetUserProfile @ ${setProfileTime}] User not logged in, erasing app_auth_state cookie.`);
            eraseCookie('app_auth_state');
        }
        return newProfile;
    });
  }, [user]);

  const checkAuthState = useCallback(async () => {
    const checkAuthStartTime = new Date().toISOString();
    console.log(`[AuthProvider checkAuthState @ ${checkAuthStartTime}] Manually re-checking auth state...`);
    setLoading(true); 
    console.log(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] setLoading(true) called.`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] Firebase Auth instance not available.`);
      // No need to call processUserSession if auth instance isn't there; just set final state
      setUser(null); 
      setUserProfileState(null);
      eraseCookie('app_auth_state');
      setLoading(false);
      console.log(`  [AuthProvider checkAuthState @ ${new Date().toISOString()}] setLoading(false) called due to no auth instance.`);
      return;
    }
    
    const currentFbUser = firebaseAuthInstance.currentUser; 
    console.log(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] firebaseAuthInstance.currentUser UID: ${currentFbUser?.uid || 'null'}. Calling processUserSession.`);
    await processUserSession(currentFbUser, 'checkAuthState');
    // processUserSession will handle setUser, setUserProfile, cookie, and setLoading(false)
    console.log(`[AuthProvider checkAuthState @ ${new Date().toISOString()}] Manual re-check completed by calling processUserSession.`);

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
  console.log(`[AuthProvider RENDER/Memo @ ${renderLogTimestamp}] Context: User UID: ${contextValue.user?.uid || 'null'}, Loading: ${contextValue.loading}, Profile ID: ${contextValue.userProfile?.id || 'null'}, isProfileCreated (context-profile): ${contextValue.userProfile?.isProfileCreated}, profileSetupComplete (context-profile): ${contextValue.userProfile?.profileSetupComplete}`);

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
    

    