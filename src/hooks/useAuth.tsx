
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
  setUserProfileStateOnly?: (profileUpdater: (prev: UserProfile | null) => UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const initialLogTimestamp = useMemo(() => new Date().toISOString(), []);
  console.log(`[AuthProvider BODY START @ ${initialLogTimestamp}]`);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileInternal] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const processUserSession = useCallback(async (fbUser: FirebaseUser | null, source: string) => {
    const processTime = new Date().toISOString();
    console.log(`  [AuthProvider processUserSession FROM ${source} @ ${processTime}] START. Received fbUser UID: ${fbUser?.uid || 'null'}. Current context User: ${user?.uid || 'null'}`);
    
    let newFirebaseUser: FirebaseUser | null = null;
    let newProfile: UserProfile | null = null;

    if (fbUser) {
      newFirebaseUser = fbUser;
      
      const profileSnap = await getDoc(doc(db, "users", fbUser.uid));
      if (profileSnap.exists()) {
        newProfile = profileSnap.data() as UserProfile;
        console.log(`    [AuthProvider fetchUserProfile @ ${processTime}] Profile fetched for ${fbUser.uid}.`);
      } else {
        console.warn(`    [AuthProvider fetchUserProfile @ ${processTime}] No profile found for ${fbUser.uid}.`);
      }
    }

    console.log(`    [AuthProvider processUserSession @ ${processTime}] setUser and setUserProfileInternal called. Context User updated to: ${newFirebaseUser?.uid || 'null'}, Context Profile updated to: ${newProfile?.id || 'null'}`);
    setUser(newFirebaseUser);
    setUserProfileInternal(newProfile);

    if (newFirebaseUser && newProfile) {
      const cookieStateToSet: AppAuthStateCookie = {
          isProfileCreated: !!newProfile.profileSetupComplete,
          authSyncComplete: true
      };
      console.log(`    [AuthProvider processUserSession @ ${processTime}] Attempting to set app_auth_state cookie for UID: ${newFirebaseUser.uid} with state:`, cookieStateToSet);
      setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
    } else {
      console.log(`    [AuthProvider processUserSession @ ${processTime}] No user or profile after processing. Attempting to erase app_auth_state cookie.`);
      eraseCookie('app_auth_state');
    }
    
    console.log(`  [AuthProvider processUserSession FROM ${source} @ ${new Date().toISOString()}] END. Setting loading to FALSE.`);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    const effectExecutionTime = new Date().toISOString();
    console.log(`[AuthProvider useEffect for onAuthStateChanged @ ${effectExecutionTime}] EXECUTING EFFECT.`);
    let isMounted = true;
    
    setLoading(true);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect @ ${effectExecutionTime}] Firebase Auth instance not available. Aborting onAuthStateChanged setup.`);
      if (isMounted) {
         processUserSession(null, 'useEffect-NoAuthInstance').catch(err => console.error("Error in processUserSession during no-auth cleanup", err));
      }
      return;
    }
    
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] firebaseAuthInstance is available. setLoading(true) and subscribing to onAuthStateChanged...`);

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      const callbackTime = new Date().toISOString();
      if (!isMounted) {
        console.log(`  [AuthProvider onAuthStateChanged CALLBACK @ ${callbackTime}] Listener FIRED but component unmounted. Aborting.`);
        return;
      }
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK @ ${callbackTime}] Listener FIRED. fbUser UID: ${fbUser?.uid || 'null'}. Calling processUserSession.`);
      await processUserSession(fbUser, 'onAuthStateChanged');
    });
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] onAuthStateChanged Listener SUBSCRIBED.`);

    return () => {
      isMounted = false;
      const cleanupTime = new Date().toISOString();
      console.log(`[AuthProvider useEffect for onAuthStateChanged @ ${cleanupTime}] CLEANING UP. Unsubscribing.`);
      unsubscribe();
    };
  }, [processUserSession]);

  const contextLogout = useCallback(async () => {
    const logoutStartTime = new Date().toISOString();
    console.log(`[AuthProvider contextLogout @ ${logoutStartTime}] Called.`);
    setLoading(true);
    eraseCookie('app_auth_state');
    if (firebaseAuthInstance) {
      try {
        await signOut(firebaseAuthInstance);
        console.log(`  [AuthProvider contextLogout @ ${new Date().toISOString()}] signOut successful. onAuthStateChanged will handle subsequent state updates.`);
      } catch (error) {
        console.error("  [AuthProvider contextLogout] Error signing out:", error);
        await processUserSession(null, 'logoutError'); 
      }
    } else {
      console.error("  [AuthProvider contextLogout] Firebase Auth instance not available for logout.");
      await processUserSession(null, 'logoutNoAuthInstance');
    }
  }, [processUserSession]);

  const setUserProfileStateOnly = useCallback((updater: (prev: UserProfile | null) => UserProfile | null) => {
    const setProfileTime = new Date().toISOString();
    console.log(`[AuthProvider setUserProfileStateOnly @ ${setProfileTime}] Manually updating profile in context via updater fn.`);
    setUserProfileInternal(prevUserProfile => {
        const newProfile = updater(prevUserProfile);
        if (user && newProfile) {
             const cookieStateToSet: AppAuthStateCookie = {
                isProfileCreated: !!newProfile.profileSetupComplete,
                authSyncComplete: getCookie('app_auth_state') ? JSON.parse(getCookie('app_auth_state')!).authSyncComplete : true,
            };
            setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
        }
        return newProfile;
    });
  }, [user]);

  const contextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    logout: contextLogout,
    setUserProfileStateOnly,
  }), [user, userProfile, loading, contextLogout, setUserProfileStateOnly]);

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
