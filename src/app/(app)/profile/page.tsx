
'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DemographicsForm from '@/components/profile/demographics-form';
import FitnessConnections from '@/components/profile/fitness-connections';
import DiagnosticsConnections from '@/components/profile/diagnostics-connections';
import InsuranceConnections from '@/components/profile/insurance-connections';
import ChangePasswordForm from '@/components/profile/change-password-form';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function ProfilePage() {
  const { user, userProfile, loading, setUserProfile } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // TODO: Implement a comprehensive save function that collects data from all tabs
  // and makes appropriate server action calls.
  const handleSaveProfile = async () => {
    setIsSaving(true);
    toast({ title: "Profile Update", description: "Saving profile data is not fully implemented yet." });
    // Example:
    // const demographicsData = ... get from DemographicsForm state
    // const fitnessData = ... get from FitnessConnections state
    // const result = await saveFullProfile(user.uid, { demographicsData, fitnessData, ... });
    // if (result.success) toast({ title: "Profile Saved!"})
    // else toast({ title: "Error", description: result.error, variant: "destructive" })
    setTimeout(() => setIsSaving(false), 1000); // Simulate save
  };


  if (loading || !user || !userProfile) {
    return <div className="p-6">Loading profile...</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-2xl">User Profile</CardTitle>
          <CardDescription>Manage your personal information, connections, and account settings.</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="demographics" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-6">
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="fitness">Fitness</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="demographics">
          <DemographicsForm userProfile={userProfile} onProfileUpdate={setUserProfile} />
        </TabsContent>
        <TabsContent value="fitness">
          <FitnessConnections userProfile={userProfile} onConnectionsUpdate={setUserProfile} />
        </TabsContent>
        <TabsContent value="diagnostics">
          <DiagnosticsConnections userProfile={userProfile} onConnectionsUpdate={setUserProfile} />
        </TabsContent>
        <TabsContent value="insurance">
          <InsuranceConnections userProfile={userProfile} onConnectionsUpdate={setUserProfile} />
        </TabsContent>
         <TabsContent value="security">
          <ChangePasswordForm />
        </TabsContent>
      </Tabs>
      
      <div className="mt-8 flex justify-end">
        <Button onClick={handleSaveProfile} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save All Profile Changes'}
        </Button>
      </div>
    </div>
  );
}
