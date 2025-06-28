
'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UserProfile, SelectableService } from '@/types';
import { mockFitnessApps } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { XCircle, CheckCircle2, Link2, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { updateConnectedFitnessApps } from '@/app/actions/userProfileActions';
import { syncFitbitSleepData } from '@/app/actions/fitbitActions';
import { format, subDays } from 'date-fns';

interface FitnessConnectionsProps {
  userProfile: UserProfile;
}

export default function FitnessConnections({ userProfile }: FitnessConnectionsProps) {
  const { user, setUserProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [isSyncing, startSyncTransition] = useTransition();

  const currentConnections = userProfile.connectedFitnessApps || [];

  const availableAppsToConnect = mockFitnessApps.filter(
    app => !currentConnections.some(conn => conn.id === app.id)
  );

  // Handle toast notifications on redirect from OAuth flow
  useEffect(() => {
    const fitbitConnected = searchParams.get('fitbit_connected');
    const fitbitError = searchParams.get('fitbit_error');
    const googlefitConnected = searchParams.get('googlefit_connected');
    const googlefitError = searchParams.get('googlefit_error');

    if (fitbitConnected) {
      toast({
        title: 'Fitbit Connected!',
        description: 'Your Fitbit account has been successfully linked.',
      });
      router.replace('/profile', { scroll: false });
    }
    if (fitbitError) {
      toast({
        title: 'Fitbit Connection Failed',
        description: `Error: ${fitbitError}`,
        variant: 'destructive',
      });
      router.replace('/profile', { scroll: false });
    }
    if (googlefitConnected) {
      toast({
        title: 'Google Fit Connected!',
        description: 'Your Google Fit account has been successfully linked.',
      });
      router.replace('/profile', { scroll: false });
    }
    if (googlefitError) {
      toast({
        title: 'Google Fit Connection Failed',
        description: `Error: ${googlefitError}`,
        variant: 'destructive',
      });
      router.replace('/profile', { scroll: false });
    }
  }, [searchParams, toast, router]);

  const handleConnect = async () => {
    if (!selectedAppId) return;
    const appToConnect = mockFitnessApps.find(app => app.id === selectedAppId);
    if (!appToConnect) return;

    setIsLoading(prev => ({ ...prev, [selectedAppId]: true }));
    // The actual OAuth flow is triggered by redirecting the user.
    window.location.href = `/api/auth/${appToConnect.id}/connect`;
  };

  const handleDisconnect = async (appId: string) => {
    if (!user) return;
    setIsLoading(prev => ({ ...prev, [appId]: true }));
    
    const serviceToDisconnect = currentConnections.find(c => c.id === appId);
    if (!serviceToDisconnect) return;

    // TODO: Add logic here to clear tokens from Firestore as well for a full cleanup.
    const result = await updateConnectedFitnessApps(user.uid, serviceToDisconnect, 'disconnect');

    if (result.success && result.data) {
      if(setUserProfile) setUserProfile(prev => prev ? ({ ...prev, ...result.data }) : null);
      toast({ title: `${serviceToDisconnect.name} Disconnected` });
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to disconnect app.', variant: 'destructive' });
    }
    setIsLoading(prev => ({ ...prev, [appId]: false }));
  };

  const handleSyncFitbit = () => {
    startSyncTransition(async () => {
      if (!user) {
        toast({ title: 'Error', description: 'Not authenticated.', variant: 'destructive'});
        return;
      }
      toast({ title: 'Syncing Fitbit Data...', description: 'Fetching sleep data for the last 7 days.' });
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const startDate = format(subDays(new Date(), 6), 'yyyy-MM-dd');
      const result = await syncFitbitSleepData(user.uid, startDate, endDate);
      if (result.success) {
        toast({ title: 'Fitbit Sync Complete!', description: result.message });
        if (result.syncedCount && result.syncedCount > 0 && setUserProfile) {
            setUserProfile(prev => prev ? ({...prev, fitbitLastSuccessfulSync: new Date().toISOString()}) : null);
        }
      } else {
        toast({ title: 'Fitbit Sync Failed', description: result.message, variant: 'destructive'});
      }
    });
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fitness App Connections</CardTitle>
        <CardDescription>
          Connect your favorite fitness apps to sync your activity data automatically.
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
                    <span className="capitalize font-medium">{conn.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {conn.id === 'fitbit' && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSyncFitbit}
                            disabled={isSyncing}
                        >
                           {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                           <span className="hidden sm:inline ml-2">Sync Now</span>
                        </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnect(conn.id)}
                      disabled={isLoading[conn.id]}
                      aria-label={`Disconnect ${conn.name}`}
                    >
                      {isLoading[conn.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 text-destructive/70 hover:text-destructive" />}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {availableAppsToConnect.length > 0 && (
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
                      <SelectItem key={app.id} value={app.id} className="capitalize">
                        {app.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleConnect}
                disabled={!selectedAppId || isLoading[selectedAppId]}
                className="w-full sm:w-auto"
              >
                {isLoading[selectedAppId] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="mr-2 h-4 w-4" />}
                Connect
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
