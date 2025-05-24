
'use client';

import React, { useState, useEffect } from 'react';
import type { UserProfile, SelectableService, SubscriptionTier } from '@/types';
import { mockFitnessApps } from '@/types'; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { XCircle, CheckCircle2, Link2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { finalizeFitbitConnection, finalizeStravaConnection } from '@/app/actions/auth'; // Assuming actions exist
import { useSearchParams, useRouter } from 'next/navigation';

interface FitnessConnectionsProps {
  userProfile: UserProfile;
  onConnectionsUpdate?: (updatedProfile: UserProfile | null) => void; // Callback to update parent state
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
  const { user, setUserProfile: setAuthUserProfile } = useAuth(); // Get current user for actions
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  const currentConnections = userProfile.connectedFitnessApps || [];
  const maxConnections = getMaxConnections(userProfile.subscriptionTier);
  const canAddMore = currentConnections.length < maxConnections;

  const availableAppsToConnect = mockFitnessApps.filter(
    app => !currentConnections.some(conn => conn.id === app.id)
  );

  // Effect to handle OAuth callback success/error
  useEffect(() => {
    const fitbitConnected = searchParams.get('fitbit_connected');
    const fitbitError = searchParams.get('fitbit_error');
    const stravaConnected = searchParams.get('strava_connected');
    const stravaError = searchParams.get('strava_error');

    const handleConnectionResult = async (serviceId: string, serviceName: string, finalizeAction: (userId: string) => Promise<{success: boolean, error?: string}>) => {
      if (!user?.uid) {
        toast({ title: `Error Finalizing ${serviceName} Connection`, description: "User session not found.", variant: "destructive" });
        return;
      }
      setIsLoading(prev => ({ ...prev, [serviceId]: true }));
      const result = await finalizeAction(user.uid);
      if (result.success) {
        toast({ title: `${serviceName} Connected!`, description: `Successfully linked your ${serviceName} account.` });
        if (onConnectionsUpdate) { // To update local state if component is part of larger form
            const newConnection = { id: serviceId, name: serviceName, connectedAt: new Date().toISOString()};
            const updatedProfile = { ...userProfile, connectedFitnessApps: [...(userProfile.connectedFitnessApps || []), newConnection]};
            onConnectionsUpdate(updatedProfile);
        }
        // Also update the AuthContext's userProfile if available
        if (setAuthUserProfile) {
            setAuthUserProfile(prev => {
                if (!prev) return null;
                const existingConnections = prev.connectedFitnessApps || [];
                if (existingConnections.some(c => c.id === serviceId)) return prev; // Already there
                return {
                    ...prev,
                    connectedFitnessApps: [...existingConnections, { id: serviceId, name: serviceName, connectedAt: new Date().toISOString() }]
                };
            });
        }
      } else {
        toast({ title: `Failed to Finalize ${serviceName} Connection`, description: result.error || "An unexpected error occurred.", variant: "destructive" });
      }
      setIsLoading(prev => ({ ...prev, [serviceId]: false }));
      router.replace('/profile', { scroll: false }); // Remove query params from URL
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
  }, [searchParams, user, toast, router, onConnectionsUpdate, userProfile, setAuthUserProfile]);


  const handleDisconnect = async (appId: string) => {
    const appToDisconnect = currentConnections.find(c => c.id === appId);
    if (!appToDisconnect || !user?.uid) return;

    setIsLoading(prev => ({ ...prev, [appId]: true }));
    toast({ title: `Disconnecting ${appToDisconnect.name}...` });
    
    // TODO: Implement server action to revoke tokens and update user profile in DB.
    // For now, just update client-side state.
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate server call
    
    const updatedConnections = currentConnections.filter(conn => conn.id !== appId);
    if (onConnectionsUpdate) {
      onConnectionsUpdate({ ...userProfile, connectedFitnessApps: updatedConnections });
    }
    if (setAuthUserProfile) {
        setAuthUserProfile(prev => prev ? ({ ...prev, connectedFitnessApps: updatedConnections }) : null);
    }
    toast({ title: `${appToDisconnect.name} Disconnected` });
    setIsLoading(prev => ({ ...prev, [appId]: false }));
  };

  const getConnectLink = (appId: string) => {
    if (appId === 'fitbit') return '/api/auth/fitbit/connect';
    if (appId === 'strava') return '/api/auth/strava/connect';
    return '#'; // Default or for apps not yet configured
  };

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
                      <SelectItem key={app.id} value={app.id} disabled={app.id !== 'fitbit' && app.id !== 'strava' /* Disable non-implemented ones */}>
                        {app.name} {(app.id !== 'fitbit' && app.id !== 'strava') && '(Coming Soon)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                asChild={selectedAppId === 'fitbit' || selectedAppId === 'strava'} // Use asChild for link behavior
                disabled={!selectedAppId || isLoading[selectedAppId] || (selectedAppId !== 'fitbit' && selectedAppId !== 'strava')}
              >
                { (selectedAppId === 'fitbit' || selectedAppId === 'strava') ? (
                    <a href={getConnectLink(selectedAppId)}>
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
