
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile, AppAuthStateCookie } from '@/types';
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
  const [loading, setLoading] = useState(true); 

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

  useEffect(() => {
    const effectExecutionTime = new Date().toISOString();
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${effectExecutionTime}`);
    
    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect @ ${effectExecutionTime}] Firebase Auth instance not available. Setting loading to false and erasing cookie.`);
      setUser(null); 
      setUserProfileState(null); 
      eraseCookie('app_auth_state'); 
      setLoading(false);
      return;
    }
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] firebaseAuthInstance in effect: true. Subscribing to onAuthStateChanged...`);

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      const callbackTime = new Date().toISOString();
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK START] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${callbackTime}`);
      
      setLoading(true); 
      console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] setLoading(true) called.`);

      let newFirebaseUser: FirebaseUser | null = null;
      let newProfile: UserProfile | null = null;

      if (fbUser) {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fbUser IS PRESENT (UID: ${fbUser.uid}).`);
        newFirebaseUser = fbUser;
        try {
          newProfile = await fetchUserProfile(fbUser);
          console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fetchUserProfile completed for UID: ${fbUser.uid}. Profile ${newProfile ? 'found' : 'NOT found'}.`);
        } catch (fetchError) {
            console.error(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fetchUserProfile THREW AN ERROR for UID ${fbUser.uid}:`, fetchError);
        }
      } else {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fbUser IS NULL.`);
      }

      setUser(newFirebaseUser);
      setUserProfileState(newProfile);
      console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] setUser and setUserProfileState called. User: ${newFirebaseUser?.uid || 'null'}, Profile: ${newProfile?.id || 'null'}`);

      if (newFirebaseUser && newProfile) {
        const cookieStateToSet: AppAuthStateCookie = {
            isProfileCreated: !!newProfile.profileSetupComplete, 
            authSyncComplete: true 
        };
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Attempting to set app_auth_state cookie for UID: ${newFirebaseUser.uid} with state:`, cookieStateToSet);
        setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1); 
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] app_auth_state cookie SET for user ${newFirebaseUser.uid}.`);
      } else {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] No user or profile. Attempting to erase app_auth_state cookie.`);
        eraseCookie('app_auth_state');
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] app_auth_state cookie ERASED.`);
      }
      
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK END @ ${new Date().toISOString()}] Setting loading to FALSE. fbUser was: ${fbUser?.uid || 'null'}.`);
      setLoading(false);
    });

    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] Listener SUBSCRIBED.`);
    
    return () => {
      const cleanupTime = new Date().toISOString();
      console.log(`[AuthProvider useEffect for onAuthStateChanged] CLEANING UP LISTENER. Timestamp: ${cleanupTime}`);
      unsubscribe();
    };
  }, [fetchUserProfile]); 

  const contextLogout = useCallback(async () => {
    const logoutStartTime = new Date().toISOString();
    console.log(`[AuthProvider contextLogout @ ${logoutStartTime}] Called.`);
    setLoading(true); 
    eraseCookie('app_auth_state');
    if (firebaseAuthInstance) {
      try {
        await signOut(firebaseAuthInstance);
        console.log(`  [AuthProvider contextLogout @ ${new Date().toISOString()}] signOut successful. onAuthStateChanged will handle clearing user/profile and setting loading to false.`);
      } catch (error) {
        console.error("  [AuthProvider contextLogout] Error signing out:", error);
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
    setLoading(true);
    console.log(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] setLoading(true) called.`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] Firebase Auth instance not available.`);
      setUser(null); setUserProfileState(null); 
      eraseCookie('app_auth_state');
      setLoading(false); 
      console.log(`  [AuthProvider checkAuthState @ ${new Date().toISOString()}] setLoading(false) called due to no auth instance.`);
      return;
    }
    
    const currentFbUser = firebaseAuthInstance.currentUser;
    let fetchedProfile: UserProfile | null = null;
    let newFirebaseUser: FirebaseUser | null = null;

    if (currentFbUser) {
      console.log(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] currentFbUser IS PRESENT (UID: ${currentFbUser.uid}).`);
      newFirebaseUser = currentFbUser;
      fetchedProfile = await fetchUserProfile(currentFbUser);
      console.log(`  [AuthProvider checkAuthState @ ${new Date().toISOString()}] fetchUserProfile completed. Profile ${fetchedProfile ? 'found' : 'NOT found'}.`);
    } else {
      console.log(`  [AuthProvider checkAuthState @ ${checkAuthStartTime}] currentFbUser IS NULL.`);
    }

    setUser(newFirebaseUser);
    setUserProfileState(fetchedProfile);
    console.log(`  [AuthProvider checkAuthState @ ${new Date().toISOString()}] setUser and setUserProfileState called. User: ${newFirebaseUser?.uid || 'null'}, Profile: ${fetchedProfile?.id || 'null'}`);

    if (newFirebaseUser && fetchedProfile) {
      const cookieStateToSet: AppAuthStateCookie = {
          isProfileCreated: !!fetchedProfile.profileSetupComplete,
          authSyncComplete: true
      };
      console.log(`  [AuthProvider checkAuthState @ ${new Date().toISOString()}] Attempting to set app_auth_state cookie with state:`, cookieStateToSet);
      setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
      console.log(`  [AuthProvider checkAuthState @ ${new Date().toISOString()}] app_auth_state cookie SET.`);
    } else {
      console.log(`  [AuthProvider checkAuthState @ ${new Date().toISOString()}] No user or profile after check. Attempting to erase app_auth_state cookie.`);
      eraseCookie('app_auth_state');
      console.log(`  [AuthProvider checkAuthState @ ${new Date().toISOString()}] app_auth_state cookie ERASED.`);
    }

    console.log(`[AuthProvider checkAuthState @ ${new Date().toISOString()}] Manual re-check complete. setLoading(false). User: ${newFirebaseUser?.uid || 'null'}, Profile: ${fetchedProfile ? fetchedProfile.id : 'null'}`);
    setLoading(false);
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
