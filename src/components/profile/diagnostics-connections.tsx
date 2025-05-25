
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
import ClickwrapAgreementDialog from '@/components/ui/clickwrap-agreement-dialog';

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

const QUEST_DIAGNOSTICS_ID = 'quest'; // Assuming 'quest' is the ID for Quest Diagnostics

const questAgreementText: string[] = [
  "By clicking “I Agree”:",
  "- You confirm that you are the rightful account holder or have the legal authority to access the Quest Diagnostics data being connected.",
  "- You give us permission to access your PHI from Quest Diagnostics as outlined above.",
  "- You acknowledge that you have read and understood this Clickwrap Agreement and agree to its terms."
];


export default function DiagnosticsConnections({ userProfile, onConnectionsUpdate }: DiagnosticsConnectionsProps) {
  const { toast } = useToast();
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [isQuestAgreementModalOpen, setQuestAgreementModalOpen] = useState(false);
  const [serviceToConnect, setServiceToConnect] = useState<SelectableService | null>(null);

  const currentConnections = userProfile.connectedDiagnosticsServices || [];
  const maxConnections = getMaxConnectionsDiagnostics(userProfile.subscriptionTier);
  const canAddMore = currentConnections.length < maxConnections;
  const tierAllowsConnection = maxConnections > 0;

  const availableServicesToConnect = mockDiagnosticServices.filter(
    service => !currentConnections.some(conn => conn.id === service.id)
  );
  
  const attemptConnection = async (service: SelectableService) => {
    // This function contains the original connection logic
    setIsLoading(prev => ({ ...prev, [service.id]: true }));
    toast({ title: `Attempting to connect to ${service.name}...`, description: "Real-time credential validation would occur now." });

    // Simulate API call for credential validation
    // TODO: Replace with actual OAuth flow or API call logic
    await new Promise(resolve => setTimeout(resolve, 2500));
    const success = Math.random() > 0.25; // Simulate success

    if (success) {
      const newConnection = { id: service.id, name: service.name, connectedAt: new Date().toISOString() };
      const updatedConnections = [...currentConnections, newConnection];
      if (onConnectionsUpdate) {
        onConnectionsUpdate({ ...userProfile, connectedDiagnosticsServices: updatedConnections });
      }
      toast({ title: `${service.name} Connected!`, description: "Successfully linked." });
    } else {
      toast({ title: `Failed to Connect ${service.name}`, description: "Connection failed. Please check credentials and try again.", variant: "destructive" });
    }
    setIsLoading(prev => ({ ...prev, [service.id]: false }));
    setSelectedServiceId('');
    setServiceToConnect(null); // Reset service to connect
  };

  const handleConnectClick = () => {
    const service = mockDiagnosticServices.find(s => s.id === selectedServiceId);
    if (!service) return;

    if (!tierAllowsConnection) {
      toast({ title: "Upgrade Required", description: `Your ${userProfile.subscriptionTier} plan does not support diagnostic service connections.`, variant: "default" });
      return;
    }
    if (!canAddMore && !currentConnections.some(c => c.id === service.id)) {
      toast({ title: "Limit Reached", description: `Your ${userProfile.subscriptionTier} plan allows ${maxConnections} diagnostic service connection(s).`, variant: "destructive" });
      return;
    }
    
    setServiceToConnect(service); // Store the service we intend to connect

    if (service.id === QUEST_DIAGNOSTICS_ID) {
      setQuestAgreementModalOpen(true);
    } else {
      // For other services, connect directly (or implement their specific modals if needed)
      attemptConnection(service);
    }
  };

  const handleQuestAgreementAgree = () => {
    if (serviceToConnect && serviceToConnect.id === QUEST_DIAGNOSTICS_ID) {
      attemptConnection(serviceToConnect);
    }
    setQuestAgreementModalOpen(false); // Close modal regardless
  };


  const handleDisconnect = async (serviceId: string) => {
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

  if (!tierAllowsConnection && userProfile.subscriptionTier !== 'platinum' && userProfile.subscriptionTier !== 'gold') { // Gold and Platinum can connect at least one
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
    <>
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
              <label htmlFor="diagnostic-service-select" className="block text-sm font-medium text-foreground">Connect a new service:</label>
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
                <Button
                  onClick={handleConnectClick}
                  disabled={!selectedServiceId || isLoading[selectedServiceId]}
                  className="w-full sm:w-auto"
                >
                  {isLoading[selectedServiceId] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="mr-2 h-4 w-4" />}
                  Connect
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                  Connection will require authorizing Health Timeline to access your data via the selected service. This may redirect you to their portal or require specific credentials.
              </p>
            </div>
          )}
          {!canAddMore && <p className="text-sm text-muted-foreground">You have reached the maximum number of connections for your plan.</p>}
          {canAddMore && availableServicesToConnect.length === 0 && currentConnections.length > 0 && <p className="text-sm text-muted-foreground">All available services are connected.</p>}
          {availableServicesToConnect.length === 0 && currentConnections.length === 0 && (
             <p className="text-sm text-muted-foreground">
                {tierAllowsConnection ? "No diagnostic services available to connect currently, or your tier limit is met." : "Diagnostic service connections are not available on your current plan."}
             </p>
          )}
        </CardContent>
      </Card>

      <ClickwrapAgreementDialog
        isOpen={isQuestAgreementModalOpen}
        onOpenChange={setQuestAgreementModalOpen}
        title="Quest Diagnostics Connection Agreement"
        agreementTextLines={questAgreementText}
        onAgree={handleQuestAgreementAgree}
      />
    </>
  );
}
