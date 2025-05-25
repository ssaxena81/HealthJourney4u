
'use client';

import React from 'react';
import { SidebarInset, useSidebar } from '@/components/ui/sidebar';
import AppHeader from './header'; 
import SidebarNav from './sidebar-nav';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
// import ManualEntryForm from '@/components/health/manual-entry-form'; // Assuming this will be re-added
import type { HealthEntry } from '@/types'; 
import { VerticalTimelinePlaceholder } from './vertical-timeline-placeholder'; 

interface AppLayoutClientProps {
  children: React.ReactNode;
  onAddEntryClick?: () => void; // Made optional as it's not used by every page via this layout
  onSyncAllClick?: () => Promise<void>; // For the sync button in sidebar
}

export default function AppLayoutClient({
  children,
  onAddEntryClick, // Will be passed from AuthenticatedAppLayout if needed
  onSyncAllClick,
}: AppLayoutClientProps) {
  const { isMobile } = useSidebar();
  const [isSheetOpen, setIsSheetOpen] = React.useState(false); 

  const handleActualAddEntryClick = () => {
      if (onAddEntryClick) {
          onAddEntryClick(); // Call passed handler if it exists
      } else {
        // Default behavior if no specific handler, e.g. open a generic sheet
        setIsSheetOpen(true); 
      }
  }

  const handleSheetAddEntry = (entry: HealthEntry) => {
    console.log("New entry added (placeholder via sheet):", entry);
    setIsSheetOpen(false);
    // TODO: Call a global add entry function or emit an event
  };

  return (
    <div className="flex min-h-screen w-full">
      <SidebarNav onSyncAllClick={onSyncAllClick} /> 
      
      <SidebarInset className="flex flex-col flex-grow">
        <AppHeader onAddEntryClick={handleActualAddEntryClick} /> 
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>

      {/* Right sidebar area for Vertical Timeline */}
      <aside className="hidden md:block w-72 lg:w-80 border-l bg-card p-0 overflow-y-auto sticky top-0 h-screen">
        <VerticalTimelinePlaceholder />
      </aside>

      {/* This sheet is now generic for adding an entry, if onAddEntryClick is not specified from parent */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full max-w-md sm:max-w-lg p-0" side={isMobile ? "bottom" : "right"}>
          <SheetHeader className="p-6 pb-2">
            <SheetTitle>Add New Health Entry</SheetTitle>
          </SheetHeader>
          {/* <ManualEntryForm onAddEntry={handleSheetAddEntry} onClose={() => setIsSheetOpen(false)} /> */}
           <div className="p-6"><p>Manual Entry Form Placeholder</p></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
