
'use client';

import React, { useState, useEffect } from 'react';
import type { UserProfile, SelectableService, SubscriptionTier } from '@/types';
// TODO: This should eventually be fetched dynamically via an admin config action
import { mockFitnessApps } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { XCircle, CheckCircle2, Link2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { finalizeFitbitConnection, finalizeStravaConnection, finalizeGoogleFitConnection, finalizeWithingsConnection } from '@/app/actions/auth';
import { useSearchParams, useRouter } from 'next/navigation';

interface FitnessConnectionsProps {
  userProfile: UserProfile;
  onConnectionsUpdate?: (updatedProfileData: Partial<UserProfile>) => void;
}

// Define a common result type for finalize actions
interface FinalizeActionResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  data?: any; // Allows for optional data, like withingsUserId
}


const getMaxConnections = (tier: SubscriptionTier): number => {
  switch (tier) {
    case 'free': return 1;
    case 'silver': return 2;
    case 'gold': return 3;
    case 'platinum': return Infinity;
    default: return 0;
  }
};

export default function FitnessConnections({ userProfile, onConnectionsUpdate }: FitnessConnectionsProps) {
  const { toast } = useToast();
  const { user, setUserProfile: setAuthUserProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [availableApps, setAvailableApps] = useState<SelectableService[]>(mockFitnessApps); // Using mock for now

  const currentConnections = userProfile.connectedFitnessApps || [];
  const maxConnections = getMaxConnections(userProfile.subscriptionTier);
  const canAddMore = currentConnections.length < maxConnections;

  const availableAppsToConnect = availableApps.filter(
    app => !currentConnections.some(conn => conn.id === app.id)
  );

  useEffect(() => {
    const fitbitConnected = searchParams.get('fitbit_connected');
    const fitbitError = searchParams.get('fitbit_error');
    const stravaConnected = searchParams.get('strava_connected');
    const stravaError = searchParams.get('strava_error');
    const googleFitConnected = searchParams.get('googlefit_connected');
    const googleFitError = searchParams.get('googlefit_error');
    const withingsConnected = searchParams.get('withings_connected');
    const withingsError = searchParams.get('withings_error');

    const handleConnectionResult = async (
        serviceId: string,
        serviceName: string,
        finalizeAction: (userId: string, apiSpecificId?: string) => Promise<FinalizeActionResult>
    ) => {
      if (!user?.uid) {
        toast({ title: `Error Finalizing ${serviceName} Connection`, description: "User session not found.", variant: "destructive" });
        router.replace('/profile', { scroll: false }); 
        return;
      }
      setIsLoading(prev => ({ ...prev, [serviceId]: true }));
      // For Withings, finalizeWithingsConnection might take a second arg (withingsApiUserId), but here we don't have it from callback, it's set during finalize.
      const result = await finalizeAction(user.uid);
      if (result.success) {
        toast({ title: `${serviceName} Connected!`, description: `Successfully linked your ${serviceName} account.` });
        
        const newConnectionDetails = { id: serviceId, name: serviceName, connectedAt: new Date().toISOString()};

        if (onConnectionsUpdate) {
            const updatedProfilePartial: Partial<UserProfile> = { 
                connectedFitnessApps: [...(userProfile.connectedFitnessApps || []).filter(c => c.id !== serviceId), newConnectionDetails]
            };
             if (serviceId === 'withings' && result.data && (result.data as { withingsUserId?: string }).withingsUserId) {
                (updatedProfilePartial as any).withingsUserId = (result.data as { withingsUserId?: string }).withingsUserId;
            }
            onConnectionsUpdate(updatedProfilePartial);
        }
        if (setAuthUserProfile) {
            setAuthUserProfile(prev => {
                if (!prev) return null;
                const existingConnections = prev.connectedFitnessApps || [];
                 const updatedProfile: UserProfile = {
                    ...prev,
                    connectedFitnessApps: [...existingConnections.filter(c => c.id !== serviceId), newConnectionDetails]
                };
                if (serviceId === 'withings' && result.data && (result.data as { withingsUserId?: string }).withingsUserId) {
                    (updatedProfile as any).withingsUserId = (result.data as { withingsUserId?: string }).withingsUserId;
                }
                return updatedProfile;
            });
        }
      } else {
        toast({ title: `Failed to Finalize ${serviceName} Connection`, description: result.error || "An unexpected error occurred.", variant: "destructive" });
      }
      setIsLoading(prev => ({ ...prev, [serviceId]: false }));
      router.replace('/profile', { scroll: false }); 
    };

    if (fitbitConnected === 'true') {
      handleConnectionResult('fitbit', 'Fitbit', finalizeFitbitConnection);
    } else if (fitbitError) {
      toast({ title: "Fitbit Connection Failed", description: decodeURIComponent(fitbitError), variant: "destructive" });
      router.replace('/profile', { scroll: false });
    }

    if (stravaConnected === 'true') {
      handleConnectionResult('strava', 'Strava', finalizeStravaConnection);
    } else if (stravaError) {
      toast({ title: "Strava Connection Failed", description: decodeURIComponent(stravaError), variant: "destructive" });
      router.replace('/profile', { scroll: false });
    }

    if (googleFitConnected === 'true') {
      handleConnectionResult('google-fit', 'Google Fit', finalizeGoogleFitConnection);
    } else if (googleFitError) {
      toast({ title: "Google Fit Connection Failed", description: decodeURIComponent(googleFitError), variant: "destructive" });
      router.replace('/profile', { scroll: false });
    }

    if (withingsConnected === 'true') {
      // The finalizeWithingsConnection function in auth.ts does accept an optional second 'withingsApiUserId' argument.
      // However, at this stage (callback handling), we don't have the Withings User ID yet from the client-side.
      // The User ID is typically obtained *after* the token exchange, often via a separate API call or embedded in the token response.
      // The `finalizeWithingsConnection` in `auth.ts` is designed to store this ID if provided.
      // For now, we call it with just `userId`. The `withingsUserId` would be populated if `setWithingsTokens` included it
      // and if the server action `finalizeWithingsConnection` retrieves and includes it in its `data` return.
      // The current implementation of `finalizeWithingsConnection` correctly sets `withingsUserId` in `connectionUpdateData`
      // if `withingsApiUserId` is passed to it. Let's assume for the callback finalization, this ID isn't known yet or is handled internally by the action.
      handleConnectionResult('withings', 'Withings', finalizeWithingsConnection);
    } else if (withingsError) {
      toast({ title: "Withings Connection Failed", description: decodeURIComponent(withingsError), variant: "destructive" });
      router.replace('/profile', { scroll: false });
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.uid, toast, router, onConnectionsUpdate, setAuthUserProfile, userProfile.connectedFitnessApps]);


  const handleDisconnect = async (appId: string) => {
    const appToDisconnect = currentConnections.find(c => c.id === appId);
    if (!appToDisconnect || !user?.uid) return;

    setIsLoading(prev => ({ ...prev, [appId]: true }));
    toast({ title: `Disconnecting ${appToDisconnect.name}...` });

    // TODO: Implement server action to revoke tokens and update user profile in DB.
    // For now, we just update the local state and call onConnectionsUpdate.
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate server call

    const updatedConnections = currentConnections.filter(conn => conn.id !== appId);
    const updatedProfilePartial: Partial<UserProfile> = { connectedFitnessApps: updatedConnections };
    if (appId === 'withings') {
        (updatedProfilePartial as any).withingsUserId = null; // Remove Withings User ID
    }

    if (onConnectionsUpdate) {
      onConnectionsUpdate(updatedProfilePartial);
    }
    if (setAuthUserProfile) {
        setAuthUserProfile(prev => {
            if (!prev) return null;
            const finalProfile = {...prev, connectedFitnessApps: updatedConnections};
            if (appId === 'withings') {
                (finalProfile as any).withingsUserId = null;
            }
            return finalProfile;
        });
    }
    toast({ title: `${appToDisconnect.name} Disconnected` });
    setIsLoading(prev => ({ ...prev, [appId]: false }));
  };

  const getConnectLink = (appId: string) => {
    if (appId === 'fitbit') return '/api/auth/fitbit/connect';
    if (appId === 'strava') return '/api/auth/strava/connect';
    if (appId === 'google-fit') return '/api/auth/googlefit/connect';
    if (appId === 'withings') return '/api/auth/withings/connect';
    return '#'; 
  };

  const implementedApps = ['fitbit', 'strava', 'google-fit', 'withings'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fitness App Connections</CardTitle>
        <CardDescription>
          Connect your favorite fitness apps. Your <strong>{userProfile.subscriptionTier}</strong> plan allows up to <strong>{maxConnections === Infinity ? 'all available' : maxConnections}</strong> connection(s).
          You have {currentConnections.length} connected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {currentConnections.length > 0 && (
          <div>
            <h3 className="text-md font-medium mb-2">Connected Apps:</h3>
            <ul className="space-y-3">
              {currentConnections.map(conn => (
                <li key={conn.id} className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span>{conn.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDisconnect(conn.id)}
                    disabled={isLoading[conn.id]}
                    aria-label={`Disconnect ${conn.name}`}
                  >
                    {isLoading[conn.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 text-destructive/70 hover:text-destructive" />}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canAddMore && availableAppsToConnect.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <Label htmlFor="fitness-app-select">Connect a new app:</Label>
            <div className="flex flex-col sm:flex-row sm:items-end sm:space-x-2 space-y-2 sm:space-y-0">
              <div className="flex-grow">
                <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                  <SelectTrigger id="fitness-app-select">
                    <SelectValue placeholder="Select an app" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAppsToConnect.map(app => (
                      <SelectItem key={app.id} value={app.id} disabled={!implementedApps.includes(app.id) && app.id !== 'withings' /* Temporarily allow Withings for dev */}>
                        {app.name} {!implementedApps.includes(app.id) && app.id !== 'withings' && '(Coming Soon)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                asChild={implementedApps.includes(selectedAppId)}
                disabled={!selectedAppId || isLoading[selectedAppId] || (!implementedApps.includes(selectedAppId) && selectedAppId !== 'withings')}
                className="w-full sm:w-auto"
                onClick={() => {
                  if (!implementedApps.includes(selectedAppId) && selectedAppId !== 'withings') { // Adjust condition
                    toast({title: "Coming Soon", description: `${mockFitnessApps.find(a => a.id === selectedAppId)?.name || 'This app'} integration is not yet available.`});
                  }
                }}
              >
                { implementedApps.includes(selectedAppId) ? (
                    <a href={getConnectLink(selectedAppId)} onClick={() => setIsLoading(prev => ({...prev, [selectedAppId]: true}))}>
                        {isLoading[selectedAppId] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="mr-2 h-4 w-4" />}
                        Connect {mockFitnessApps.find(app => app.id === selectedAppId)?.name}
                    </a>
                ) : (
                    <>
                        {isLoading[selectedAppId] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="mr-2 h-4 w-4" />}
                        Connect {mockFitnessApps.find(app => app.id === selectedAppId)?.name || ''}
                    </>
                )}
              </Button>
            </div>
          </div>
        )}
        {!canAddMore && <p className="text-sm text-muted-foreground">You have reached the maximum number of connections for your plan.</p>}
        {canAddMore && availableAppsToConnect.length === 0 && currentConnections.length > 0 && <p className="text-sm text-muted-foreground">All available apps are connected.</p>}
         {availableAppsToConnect.length === 0 && currentConnections.length === 0 && <p className="text-sm text-muted-foreground">No fitness apps available to connect currently.</p>}
      </CardContent>
    </Card>
  );
}
