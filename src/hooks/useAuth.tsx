
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
  }, []); // db is stable

  useEffect(() => {
    const effectExecutionTime = new Date().toISOString();
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${effectExecutionTime}`);
    
    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect @ ${effectExecutionTime}] Firebase Auth instance not available. Setting loading to false and erasing cookie.`);
      setLoading(false);
      eraseCookie('app_auth_state'); 
      return;
    }
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] firebaseAuthInstance in effect: true. Subscribing to onAuthStateChanged...`);

    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      const callbackTime = new Date().toISOString();
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK START] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${callbackTime}`);
      
      console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Immediately setting loading to TRUE.`);
      setLoading(true);
      let fetchedProfile: UserProfile | null = null;

      if (fbUser) {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fbUser IS PRESENT (UID: ${fbUser.uid}). Calling setUser...`);
        setUser(fbUser);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] setUser called. Now attempting to fetch profile for UID: ${fbUser.uid}...`);
        
        try {
          fetchedProfile = await fetchUserProfile(fbUser);
          console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fetchUserProfile completed for UID: ${fbUser.uid}. Profile ${fetchedProfile ? 'found' : 'NOT found'}.`);
        } catch (fetchError) {
            console.error(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fetchUserProfile THREW AN ERROR for UID ${fbUser.uid}:`, fetchError);
        }
        
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Calling setUserProfileState for UID: ${fbUser.uid}...`);
        setUserProfileState(fetchedProfile);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] setUserProfileState called. Profile was ${fetchedProfile ? 'set' : 'set to null'}.`);
        
        const cookieStateToSet: AppAuthStateCookie = {
            isProfileCreated: !!fetchedProfile?.isProfileCreated, // Use isProfileCreated from DB
            authSyncComplete: true // AuthProvider sync is complete
        };
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Attempting to set app_auth_state cookie for UID: ${fbUser.uid} with state:`, cookieStateToSet);
        setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1); 
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] app_auth_state cookie SET.`);

      } else {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] fbUser IS NULL.`);
        setUser(null);
        setUserProfileState(null);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User and profile states cleared. Attempting to erase app_auth_state cookie.`);
        eraseCookie('app_auth_state');
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] app_auth_state cookie ERASED.`);
      }
      
      const currentContextUserUID = user?.uid; 
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK END @ ${new Date().toISOString()}] Setting loading to FALSE. Triggering fbUser was: ${fbUser?.uid || 'null'}. Context user state before this setLoading(false): ${currentContextUserUID || 'null'}. Fetched profile for cookie:`, fetchedProfile);
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
    eraseCookie('app_auth_state');
    if (firebaseAuthInstance) {
      try {
        await signOut(firebaseAuthInstance);
        console.log(`  [AuthProvider contextLogout @ ${new Date().toISOString()}] signOut successful. onAuthStateChanged will handle state updates.`);
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
        // After profile is updated in context, update the cookie
        if (newProfile && user) { // Ensure user is still logged in
             const cookieStateToSet: AppAuthStateCookie = {
                isProfileCreated: !!newProfile.profileSetupComplete, // Or newProfile.isProfileCreated if that's the primary source
                authSyncComplete: true // Assume sync is complete if profile is updated
            };
            console.log(`    [AuthProvider contextSetUserProfile] Setting app_auth_state cookie with new profile state:`, cookieStateToSet);
            setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
        } else if (!newProfile && !user) { // If profile and user become null (e.g. during logout sequence triggered elsewhere)
            eraseCookie('app_auth_state');
        }
        return newProfile;
    });
  }, [user]); // Depend on user to ensure we don't set cookie if user logs out during this
  
  const checkAuthState = useCallback(async () => {
    if (!firebaseAuthInstance) {
      console.warn("[AuthProvider checkAuthState] Firebase Auth instance not available.");
      setLoading(false); 
      eraseCookie('app_auth_state');
      return;
    }
    console.log("[AuthProvider checkAuthState] Manually re-checking auth state...");
    setLoading(true);
    const currentFbUser = firebaseAuthInstance.currentUser;
    let fetchedProfile: UserProfile | null = null;
    if (currentFbUser) {
      setUser(currentFbUser);
      fetchedProfile = await fetchUserProfile(currentFbUser);
      setUserProfileState(fetchedProfile);
      const cookieStateToSet: AppAuthStateCookie = {
          isProfileCreated: !!fetchedProfile?.profileSetupComplete, // Or isProfileCreated
          authSyncComplete: true
      };
      setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
    } else {
      setUser(null);
      setUserProfileState(null);
      eraseCookie('app_auth_state');
    }
    setLoading(false);
    console.log("[AuthProvider checkAuthState] Manual re-check complete. User:", currentFbUser?.uid || 'null', "Profile:", fetchedProfile ? fetchedProfile.id : 'null');
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
