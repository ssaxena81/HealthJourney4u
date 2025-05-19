
'use client';

import React from 'react';
import { SidebarInset, useSidebar } from '@/components/ui/sidebar';
import AppHeader from './header'; 
import SidebarNav from './sidebar-nav';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ManualEntryForm from '@/components/health/manual-entry-form'; 
import type { HealthEntry } from '@/types'; 
import { VerticalTimelinePlaceholder } from './vertical-timeline-placeholder'; 

interface AppLayoutClientProps {
  children: React.ReactNode;
}

export default function AppLayoutClient({
  children,
}: AppLayoutClientProps) {
  const { isMobile } = useSidebar();
  const [isSheetOpen, setIsSheetOpen] = React.useState(false); 

  const handleAddEntry = (entry: HealthEntry) => {
    console.log("New entry added (placeholder):", entry);
    setIsSheetOpen(false);
  };

  return (
    <div className="flex min-h-screen w-full">
      <SidebarNav /> 
      
      <SidebarInset className="flex flex-col flex-grow">
        <AppHeader onAddEntryClick={() => setIsSheetOpen(true)} /> 
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>

      {/* Right sidebar area for Vertical Timeline */}
      <aside className="hidden md:block w-72 lg:w-80 border-l bg-card p-0 overflow-y-auto sticky top-0 h-screen">
        <VerticalTimelinePlaceholder />
      </aside>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full max-w-md sm:max-w-lg p-0" side={isMobile ? "bottom" : "right"}>
          <SheetHeader className="p-6 pb-2">
            <SheetTitle>Add New Health Entry</SheetTitle>
          </SheetHeader>
          {/* <ManualEntryForm onAddEntry={handleAddEntry} onClose={() => setIsSheetOpen(false)} /> */}
          <div className="p-6"><p>Manual Entry Form Placeholder</p></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
