
'use client';

import React, { useState, useEffect } from 'react';
import type { UserProfile, SelectableService, SubscriptionTier } from '@/types';
import { mockFitnessApps } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { XCircle, CheckCircle2, Link2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { finalizeFitbitConnection, finalizeStravaConnection, finalizeGoogleFitConnection, finalizeWithingsConnection } from '@/app/actions/auth';
import { useSearchParams, useRouter } from 'next/navigation';

interface FitnessConnectionsProps {
  userProfile: UserProfile;
  onConnectionsUpdate?: (updatedProfileData: Partial<UserProfile>) => void;
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
  const [availableApps, setAvailableApps] = useState<SelectableService[]>(mockFitnessApps);

  const currentConnections = userProfile.connectedFitnessApps || [];
  const maxConnections = getMaxConnections(userProfile.subscriptionTier);
  const canAddMore = currentConnections.length < maxConnections;

  const availableAppsToConnect = availableApps.filter(
    app => !currentConnections.some(conn => conn.id === app.id)
  );

  useEffect(() => {
    const handleConnectionCallback = async (serviceId: string, serviceName: string, connectedParam: string | null, errorParam: string | null, finalizeAction: (userId: string) => Promise<any>) => {
      if (connectedParam !== 'true') {
        if (errorParam) {
          toast({ title: `${serviceName} Connection Failed`, description: decodeURIComponent(errorParam), variant: "destructive" });
          router.replace('/profile', { scroll: false });
        }
        return;
      }

      if (!user?.uid) {
        toast({ title: `Error Finalizing ${serviceName} Connection`, description: "User session not found.", variant: "destructive" });
        router.replace('/profile', { scroll: false });
        return;
      }

      setIsLoading(prev => ({ ...prev, [serviceId]: true }));
      const result = await finalizeAction(user.uid);
      
      if (result.success) {
        toast({ title: `${serviceName} Connected!`, description: `Successfully linked your ${serviceName} account.` });
        const newConnectionDetails = { id: serviceId, name: serviceName, connectedAt: new Date().toISOString() };
        if (onConnectionsUpdate) {
            onConnectionsUpdate({ connectedFitnessApps: [...(userProfile.connectedFitnessApps || []).filter(c => c.id !== serviceId), newConnectionDetails] });
        }
      } else {
        toast({ title: `Failed to Finalize ${serviceName} Connection`, description: result.error || "An unexpected error occurred.", variant: "destructive" });
      }

      setIsLoading(prev => ({ ...prev, [serviceId]: false }));
      router.replace('/profile', { scroll: false });
    };

    handleConnectionCallback('fitbit', 'Fitbit', searchParams.get('fitbit_connected'), searchParams.get('fitbit_error'), finalizeFitbitConnection);
    handleConnectionCallback('strava', 'Strava', searchParams.get('strava_connected'), searchParams.get('strava_error'), finalizeStravaConnection);
    handleConnectionCallback('google-fit', 'Google Fit', searchParams.get('googlefit_connected'), searchParams.get('googlefit_error'), finalizeGoogleFitConnection);
    handleConnectionCallback('withings', 'Withings', searchParams.get('withings_connected'), searchParams.get('withings_error'), finalizeWithingsConnection);
    
  // NOTE: This exhaustive-deps warning is tricky because including all dependencies
  // like `onConnectionsUpdate` can cause re-renders. We are intentionally running this only
  // when searchParams change, as it's the trigger for this logic.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleDisconnect = async (appId: string) => {
    const appToDisconnect = currentConnections.find(c => c.id === appId);
    if (!appToDisconnect || !user?.uid) return;

    setIsLoading(prev => ({ ...prev, [appId]: true }));
    toast({ title: `Disconnecting ${appToDisconnect.name}...` });
    // TODO: Server action to revoke tokens and update user profile in DB.
    await new Promise(resolve => setTimeout(resolve, 1000));

    const updatedConnections = currentConnections.filter(conn => conn.id !== appId);
    if (onConnectionsUpdate) {
      onConnectionsUpdate({ connectedFitnessApps: updatedConnections });
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
                      <SelectItem key={app.id} value={app.id} disabled={!implementedApps.includes(app.id)}>
                        {app.name} {!implementedApps.includes(app.id) && '(Coming Soon)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                asChild={implementedApps.includes(selectedAppId)}
                disabled={!selectedAppId || isLoading[selectedAppId] || !implementedApps.includes(selectedAppId)}
                className="w-full sm:w-auto"
                onClick={() => {
                  if (implementedApps.includes(selectedAppId)) {
                    setIsLoading(prev => ({...prev, [selectedAppId]: true}));
                  } else {
                    toast({title: "Coming Soon", description: `${mockFitnessApps.find(a => a.id === selectedAppId)?.name || 'This app'} integration is not yet available.`});
                  }
                }}
              >
                { implementedApps.includes(selectedAppId) ? (
                    <a href={getConnectLink(selectedAppId)}>
                        {isLoading[selectedAppId] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="mr-2 h-4 w-4" />}
                        Connect
                    </a>
                ) : (
                    <>
                        <Link2 className="mr-2 h-4 w-4" />
                        Connect
                    </>
                )}
              </Button>
            </div>
          </div>
        )}
        {!canAddMore && <p className="text-sm text-muted-foreground">You have reached the maximum number of connections for your plan.</p>}
        {canAddMore && availableAppsToConnect.length === 0 && currentConnections.length > 0 && <p className="text-sm text-muted-foreground">All available apps are connected.</p>}
      </CardContent>
    </Card>
  );
}
