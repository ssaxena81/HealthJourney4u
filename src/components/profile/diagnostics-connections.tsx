
'use client';

import React, { useState } from 'react';
import type { UserProfile, SelectableService, SubscriptionTier } from '@/types';
import { mockDiagnosticServices } from '@/types'; // Using mock data
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input'; // For potential credential input
import { useToast } from '@/hooks/use-toast';
import { XCircle, CheckCircle2, Link2, Loader2 } from 'lucide-react';

interface DiagnosticsConnectionsProps {
  userProfile: UserProfile;
  onConnectionsUpdate?: (updatedProfile: UserProfile | null) => void;
}

const getMaxConnectionsDiagnostics = (tier: SubscriptionTier): number => {
  switch (tier) {
    case 'free': return 0;
    case 'silver': return 0;
    case 'gold': return 1;
    case 'platinum': return Infinity; // Effectively all
    default: return 0;
  }
};

export default function DiagnosticsConnections({ userProfile, onConnectionsUpdate }: DiagnosticsConnectionsProps) {
  const { toast } = useToast();
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  // Example state for credential input, this would be more complex
  const [credentials, setCredentials] = useState<Record<string, string>>({}); 
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  const currentConnections = userProfile.connectedDiagnosticsServices || [];
  const maxConnections = getMaxConnectionsDiagnostics(userProfile.subscriptionTier);
  const canAddMore = currentConnections.length < maxConnections;
  const tierAllowsConnection = maxConnections > 0;

  const availableServicesToConnect = mockDiagnosticServices.filter(
    service => !currentConnections.some(conn => conn.id === service.id)
  );
  
  const handleConnect = async (service: SelectableService) => {
    if (!tierAllowsConnection) {
      toast({ title: "Upgrade Required", description: `Your ${userProfile.subscriptionTier} plan does not support diagnostic service connections.`, variant: "default" });
      return;
    }
    if (!canAddMore && !currentConnections.some(c => c.id === service.id)) {
      toast({ title: "Limit Reached", description: `Your ${userProfile.subscriptionTier} plan allows ${maxConnections} diagnostic service connection(s).`, variant: "destructive" });
      return;
    }

    // TODO: Actual credential prompt / OAuth flow
    // For now, we simulate. Credential validation should be real-time.
    // if (!credentials[service.id] || credentials[service.id].length < 5) {
    //   toast({ title: "Credentials Required", description: `Please enter valid credentials for ${service.name}.`, variant: "destructive" });
    //   return;
    // }

    setIsLoading(prev => ({ ...prev, [service.id]: true }));
    toast({ title: `Attempting to connect to ${service.name}...`, description: "Real-time credential validation would occur now." });

    // Simulate API call for credential validation
    await new Promise(resolve => setTimeout(resolve, 2500));
    const success = Math.random() > 0.25; // Simulate success

    if (success) {
      const newConnection = { id: service.id, name: service.name, connectedAt: new Date().toISOString() };
      const updatedConnections = [...currentConnections, newConnection];
      // TODO: Call server action to securely store OAuth tokens/credentials and update user profile
      if (onConnectionsUpdate) {
        onConnectionsUpdate({ ...userProfile, connectedDiagnosticsServices: updatedConnections });
      }
      toast({ title: `${service.name} Connected!`, description: "Successfully linked." });
      setCredentials(prev => ({...prev, [service.id]: ''})); // Clear dummy credentials
    } else {
      toast({ title: `Failed to Connect ${service.name}`, description: "Connection failed. Please check credentials and try again.", variant: "destructive" });
    }
    setIsLoading(prev => ({ ...prev, [service.id]: false }));
    setSelectedServiceId('');
  };

  const handleDisconnect = async (serviceId: string) => {
    // Similar to FitnessConnections
    const serviceToDisconnect = currentConnections.find(c => c.id === serviceId);
    if (!serviceToDisconnect) return;
    setIsLoading(prev => ({ ...prev, [serviceId]: true }));
    // TODO: Server action to revoke access
    await new Promise(resolve => setTimeout(resolve, 1000));
    const updatedConnections = currentConnections.filter(conn => conn.id !== serviceId);
    if (onConnectionsUpdate) {
      onConnectionsUpdate({ ...userProfile, connectedDiagnosticsServices: updatedConnections });
    }
    toast({ title: `${serviceToDisconnect.name} Disconnected` });
    setIsLoading(prev => ({ ...prev, [serviceId]: false }));
  };

  if (!tierAllowsConnection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Diagnostic Service Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Connecting to diagnostic services like Quest or LabCorp is available on Gold and Platinum plans.
            Consider upgrading your plan to access this feature.
          </p>
          {/* TODO: Add an "Upgrade Plan" button here */}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnostic Service Connections</CardTitle>
        <CardDescription>
          Connect diagnostic services. Your <strong>{userProfile.subscriptionTier}</strong> plan allows up to <strong>{maxConnections === Infinity ? 'all available' : maxConnections}</strong> connection(s).
          You have {currentConnections.length} connected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {currentConnections.length > 0 && (
          <div>
            <h3 className="text-md font-medium mb-2">Connected Services:</h3>
            <ul className="space-y-3">
              {currentConnections.map(conn => (
                <li key={conn.id} className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span>{conn.name}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDisconnect(conn.id)} disabled={isLoading[conn.id]}>
                    {isLoading[conn.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 text-destructive/70 hover:text-destructive" />}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canAddMore && availableServicesToConnect.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <Label htmlFor="diagnostic-service-select">Connect a new service:</Label>
            <div className="flex flex-col space-y-2">
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger id="diagnostic-service-select">
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {availableServicesToConnect.map(service => (
                    <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Placeholder for credential input - this would be more complex for OAuth */}
              {/* {selectedServiceId && (
                <Input 
                    type="text" 
                    placeholder={`Enter credentials/token for ${mockDiagnosticServices.find(s => s.id === selectedServiceId)?.name}`}
                    value={credentials[selectedServiceId] || ''}
                    onChange={(e) => setCredentials(prev => ({...prev, [selectedServiceId]: e.target.value}))}
                    disabled={isLoading[selectedServiceId]}
                />
              )} */}
              <Button
                onClick={() => {
                  const serviceToConnect = mockDiagnosticServices.find(s => s.id === selectedServiceId);
                  if (serviceToConnect) handleConnect(serviceToConnect);
                }}
                disabled={!selectedServiceId || isLoading[selectedServiceId]}
                className="w-full sm:w-auto"
              >
                {isLoading[selectedServiceId] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="mr-2 h-4 w-4" />}
                Connect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
                Connection will require authorizing Health Timeline to access your data via the selected service. This may redirect you to their portal.
            </p>
          </div>
        )}
        {!canAddMore && <p className="text-sm text-muted-foreground">You have reached the maximum number of connections for your plan.</p>}
        {canAddMore && availableServicesToConnect.length === 0 && currentConnections.length > 0 && <p className="text-sm text-muted-foreground">All available services are connected.</p>}
        {availableServicesToConnect.length === 0 && currentConnections.length === 0 && <p className="text-sm text-muted-foreground">No diagnostic services available to connect currently.</p>}
      </CardContent>
    </Card>
  );
}
