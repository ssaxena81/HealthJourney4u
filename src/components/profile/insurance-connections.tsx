
'use client';

import React, { useState, useEffect } from 'react';
import type { UserProfile, SelectableService, SubscriptionTier } from '@/types';
// TODO: This should eventually be fetched dynamically via an admin config action
import { mockInsuranceProviders } from '@/types'; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { XCircle, CheckCircle2, Link2, Loader2 } from 'lucide-react';

interface InsuranceConnectionsProps {
  userProfile: UserProfile;
  onConnectionsUpdate?: (updatedProfile: Partial<UserProfile>) => void;
}

const getMaxConnectionsInsurance = (tier: SubscriptionTier): number => {
  switch (tier) {
    case 'free': return 1;
    case 'silver': return 2;
    case 'gold': return 3;
    case 'platinum': return Infinity;
    default: return 0;
  }
};

interface InsuranceFormData {
  providerId: string;
  memberId: string;
  groupId: string;
}

export default function InsuranceConnections({ userProfile, onConnectionsUpdate }: InsuranceConnectionsProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<InsuranceFormData>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [availableProviders, setAvailableProviders] = useState<SelectableService[]>(mockInsuranceProviders); // Using mock for now

  // TODO: Fetch availableInsuranceProviders from a server action:
  // useEffect(() => {
  //   async function fetchProviders() {
  //     const result = await getConnectableServicesConfig(); // Assuming this action exists
  //     if (result.success && result.data) {
  //       setAvailableProviders(result.data.insuranceProviders);
  //     } else {
  //       toast({ title: "Error", description: "Could not load list of insurance providers.", variant: "destructive" });
  //     }
  //   }
  //   fetchProviders();
  // }, [toast]);


  const currentConnections = userProfile.connectedInsuranceProviders || [];
  const maxConnections = getMaxConnectionsInsurance(userProfile.subscriptionTier);
  const canAddMore = currentConnections.length < maxConnections;

  const availableProvidersToConnect = availableProviders.filter(
    provider => !currentConnections.some(conn => conn.id === provider.id)
  );

  const handleInputChange = (field: keyof InsuranceFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleConnect = async () => {
    if (!formData.providerId || !formData.memberId) {
      toast({ title: "Missing Information", description: "Please select an insurance provider and enter your Member ID.", variant: "destructive" });
      return;
    }
    if (!canAddMore) {
      toast({ title: "Limit Reached", description: `Your ${userProfile.subscriptionTier} plan allows ${maxConnections} insurance provider connection(s).`, variant: "destructive" });
      return;
    }

    const provider = availableProviders.find(p => p.id === formData.providerId);
    if (!provider) return;

    setIsLoading(prev => ({ ...prev, [provider.id]: true }));
    toast({ title: `Connecting to ${provider.name}...`, description: "Verifying your insurance details. (Placeholder)" });

    // Simulate API call for credential validation
    // TODO: Implement server action for actual API call and data pull attempt
    await new Promise(resolve => setTimeout(resolve, 2500));
    const success = Math.random() > 0.2; // Simulate success

    if (success) {
      const newConnection = { 
        id: provider.id, 
        name: provider.name, 
        memberId: formData.memberId!, 
        groupId: formData.groupId,
        connectedAt: new Date().toISOString() 
      };
      const updatedConnections = [...currentConnections, newConnection];
      
      if (onConnectionsUpdate) {
        onConnectionsUpdate({ ...userProfile, connectedInsuranceProviders: updatedConnections });
      }
      toast({ title: `${provider.name} Connected!`, description: "Successfully linked your insurance." });
      setFormData({}); 
    } else {
      toast({ title: `Failed to Connect ${provider.name}`, description: "Connection failed. Please check your Member ID and Group ID, then try again.", variant: "destructive" });
    }
    setIsLoading(prev => ({ ...prev, [provider.id]: false }));
  };

  const handleDisconnect = async (providerId: string) => {
    const providerToDisconnect = currentConnections.find(c => c.id === providerId);
    if (!providerToDisconnect) return;

    setIsLoading(prev => ({ ...prev, [providerId]: true }));
    // TODO: Server action to remove connection details and update user profile in DB
    await new Promise(resolve => setTimeout(resolve, 1000));
    const updatedConnections = currentConnections.filter(conn => conn.id !== providerId);
    if (onConnectionsUpdate) {
      onConnectionsUpdate({ ...userProfile, connectedInsuranceProviders: updatedConnections });
    }
    toast({ title: `${providerToDisconnect.name} Disconnected` });
    setIsLoading(prev => ({ ...prev, [providerId]: false }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Insurance Provider Connections</CardTitle>
        <CardDescription>
          Connect your health insurance providers. Your <strong>{userProfile.subscriptionTier}</strong> plan allows up to <strong>{maxConnections === Infinity ? 'all available' : maxConnections}</strong> connection(s).
          You have {currentConnections.length} connected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {currentConnections.length > 0 && (
          <div>
            <h3 className="text-md font-medium mb-2">Connected Providers:</h3>
            <ul className="space-y-3">
              {currentConnections.map(conn => (
                <li key={conn.id} className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                        <p>{conn.name}</p>
                        <p className="text-xs text-muted-foreground">Member ID: {conn.memberId} {conn.groupId && `| Group ID: ${conn.groupId}`}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDisconnect(conn.id)} disabled={isLoading[conn.id]}>
                     {isLoading[conn.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 text-destructive/70 hover:text-destructive" />}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canAddMore && availableProvidersToConnect.length > 0 && (
          <div className="space-y-4 pt-4 border-t">
            <Label>Connect a new insurance provider:</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="insurance-provider-select">Insurance Company *</Label>
                <Select 
                    value={formData.providerId || ''} 
                    onValueChange={(value) => handleInputChange('providerId', value)}
                    disabled={isLoading[formData.providerId || '']}
                >
                  <SelectTrigger id="insurance-provider-select">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProvidersToConnect.map(provider => (
                      <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="memberId">Member ID *</Label>
                <Input 
                    id="memberId" 
                    value={formData.memberId || ''} 
                    onChange={(e) => handleInputChange('memberId', e.target.value)}
                    placeholder="Enter Member ID"
                    disabled={isLoading[formData.providerId || '']}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="groupId">Group ID (Optional)</Label>
                <Input 
                    id="groupId" 
                    value={formData.groupId || ''} 
                    onChange={(e) => handleInputChange('groupId', e.target.value)}
                    placeholder="Enter Group ID"
                    disabled={isLoading[formData.providerId || '']}
                />
              </div>
            </div>
            <Button
              onClick={handleConnect}
              disabled={!formData.providerId || !formData.memberId || isLoading[formData.providerId || '']}
              className="w-full sm:w-auto"
            >
              {isLoading[formData.providerId || ''] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="mr-2 h-4 w-4" />}
              Verify and Connect
            </Button>
             <p className="text-xs text-muted-foreground">
                Connection will attempt to verify your details with the insurance provider.
            </p>
          </div>
        )}
        {!canAddMore && <p className="text-sm text-muted-foreground">You have reached the maximum number of connections for your plan.</p>}
        {canAddMore && availableProvidersToConnect.length === 0 && currentConnections.length > 0 && <p className="text-sm text-muted-foreground">All available providers are connected.</p>}
        {availableProvidersToConnect.length === 0 && currentConnections.length === 0 && <p className="text-sm text-muted-foreground">No insurance providers available to connect currently.</p>}
      </CardContent>
    </Card>
  );
}

