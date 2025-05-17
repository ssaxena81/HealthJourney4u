
'use client';

import React, { useState } from 'react';
import type { UserProfile, SelectableService, SubscriptionTier } from '@/types';
import { mockFitnessApps } from '@/types'; // Using mock data for available apps
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { XCircle, CheckCircle2, Link2, Loader2 } from 'lucide-react';

interface FitnessConnectionsProps {
  userProfile: UserProfile;
  onConnectionsUpdate?: (updatedProfile: UserProfile | null) => void;
}

const getMaxConnections = (tier: SubscriptionTier): number => {
  switch (tier) {
    case 'free': return 1;
    case 'silver': return 2;
    case 'gold': return 3;
    case 'platinum': return Infinity; // Effectively all
    default: return 0;
  }
};

export default function FitnessConnections({ userProfile, onConnectionsUpdate }: FitnessConnectionsProps) {
  const { toast } = useToast();
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({}); // For individual connection attempts

  // For this component, 'connections' are stored in userProfile.connectedFitnessApps
  const currentConnections = userProfile.connectedFitnessApps || [];
  const maxConnections = getMaxConnections(userProfile.subscriptionTier);
  const canAddMore = currentConnections.length < maxConnections;

  const availableAppsToConnect = mockFitnessApps.filter(
    app => !currentConnections.some(conn => conn.id === app.id)
  );

  const handleConnect = async (app: SelectableService) => {
    if (!canAddMore && !currentConnections.some(c => c.id === app.id)) {
      toast({ title: "Limit Reached", description: `Your ${userProfile.subscriptionTier} plan allows ${maxConnections} fitness app connection(s).`, variant: "destructive" });
      return;
    }

    setIsLoading(prev => ({ ...prev, [app.id]: true }));
    toast({ title: `Connecting to ${app.name}...`, description: "OAuth flow and credential validation would happen here." });

    // Simulate API call and OAuth flow
    // TODO: Implement actual OAuth flow and credential validation using server actions.
    // For now, simulate success.
    await new Promise(resolve => setTimeout(resolve, 2000));
    const success = Math.random() > 0.2; // Simulate 80% success rate

    if (success) {
      const newConnection = { id: app.id, name: app.name, connectedAt: new Date().toISOString() };
      const updatedConnections = [...currentConnections, newConnection];
      // TODO: Call server action to securely store OAuth tokens and update user profile in DB
      // For optimistic update:
      if (onConnectionsUpdate) {
        onConnectionsUpdate({ ...userProfile, connectedFitnessApps: updatedConnections });
      }
      toast({ title: `${app.name} Connected!`, description: "Successfully linked your account." });
    } else {
      toast({ title: `Failed to Connect ${app.name}`, description: "Please try again. Ensure credentials are correct.", variant: "destructive" });
    }
    setIsLoading(prev => ({ ...prev, [app.id]: false }));
    setSelectedAppId(''); // Reset dropdown
  };

  const handleDisconnect = async (appId: string) => {
    const appToDisconnect = currentConnections.find(c => c.id === appId);
    if (!appToDisconnect) return;

    setIsLoading(prev => ({ ...prev, [appId]: true }));
    toast({ title: `Disconnecting ${appToDisconnect.name}...` });
    
    // TODO: Implement server action to revoke tokens and update user profile in DB.
    await new Promise(resolve => setTimeout(resolve, 1000));
    const updatedConnections = currentConnections.filter(conn => conn.id !== appId);
    if (onConnectionsUpdate) {
      onConnectionsUpdate({ ...userProfile, connectedFitnessApps: updatedConnections });
    }
    toast({ title: `${appToDisconnect.name} Disconnected` });
    setIsLoading(prev => ({ ...prev, [appId]: false }));
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
            <div className="flex space-x-2">
              <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                <SelectTrigger id="fitness-app-select" className="flex-grow">
                  <SelectValue placeholder="Select an app" />
                </SelectTrigger>
                <SelectContent>
                  {availableAppsToConnect.map(app => (
                    <SelectItem key={app.id} value={app.id}>{app.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => {
                  const appToConnect = mockFitnessApps.find(app => app.id === selectedAppId);
                  if (appToConnect) handleConnect(appToConnect);
                }}
                disabled={!selectedAppId || isLoading[selectedAppId]}
              >
                {isLoading[selectedAppId] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="mr-2 h-4 w-4" />}
                Connect
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
