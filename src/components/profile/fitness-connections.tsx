
'use client';

import React, { useState } from 'react';
import type { UserProfile, SelectableService } from '@/types';
import { mockFitnessApps } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { XCircle, CheckCircle2, Link2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface FitnessConnectionsProps {
  userProfile: UserProfile;
}

export default function FitnessConnections({ userProfile }: FitnessConnectionsProps) {
  const { toast } = useToast();
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  
  // For now, connections are not persisted. This is a UI placeholder.
  const [currentConnections, setCurrentConnections] = useState<SelectableService[]>([]);

  const availableAppsToConnect = mockFitnessApps.filter(
    app => !currentConnections.some(conn => conn.id === app.id)
  );
  
  const handleConnect = async () => {
    if (!selectedAppId) return;

    setIsLoading(prev => ({...prev, [selectedAppId]: true}));
    const appToConnect = mockFitnessApps.find(app => app.id === selectedAppId);
    
    // Placeholder for OAuth flow
    toast({ title: `Connecting to ${appToConnect?.name}...`, description: "This is a placeholder for the OAuth flow."});
    await new Promise(res => setTimeout(res, 1500));
    
    if (appToConnect) {
      setCurrentConnections(prev => [...prev, appToConnect]);
      toast({ title: "Connected (Simulated)", description: `Connection to ${appToConnect.name} is simulated.` });
    }
    
    setIsLoading(prev => ({...prev, [selectedAppId]: false}));
    setSelectedAppId('');
  };

  const handleDisconnect = async (appId: string) => {
    setIsLoading(prev => ({ ...prev, [appId]: true }));
    await new Promise(res => setTimeout(res, 1000));
    setCurrentConnections(prev => prev.filter(c => c.id !== appId));
    setIsLoading(prev => ({ ...prev, [appId]: false }));
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fitness App Connections</CardTitle>
        <CardDescription>
          Connect your favorite fitness apps. (Functionality is currently simulated).
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
                      <SelectItem key={app.id} value={app.id}>
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
