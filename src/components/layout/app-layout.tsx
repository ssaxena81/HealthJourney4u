'use client';

import React from 'react';
import type { HealthMetricType } from '@/types';
import { SidebarInset, useSidebar } from '@/components/ui/sidebar';
import AppHeader from './header';
import SidebarNav from './sidebar-nav';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ManualEntryForm from '@/components/health/manual-entry-form';
import type { HealthEntry } from '@/types';

interface AppLayoutProps {
  children: React.ReactNode;
  selectedCategories: HealthMetricType[];
  onCategoryChange: (category: HealthMetricType, checked: boolean) => void;
  onAddEntry: (entry: HealthEntry) => void;
}

export default function AppLayout({
  children,
  selectedCategories,
  onCategoryChange,
  onAddEntry,
}: AppLayoutProps) {
  const { isMobile } = useSidebar();
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);

  const handleAddEntry = (entry: HealthEntry) => {
    onAddEntry(entry);
    // Potentially show a toast notification here
  };

  return (
    <div className="flex min-h-screen w-full">
      <SidebarNav
        selectedCategories={selectedCategories}
        onCategoryChange={onCategoryChange}
      />
      <SidebarInset className="flex flex-col">
        <AppHeader onAddEntryClick={() => setIsSheetOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full max-w-md sm:max-w-lg p-0" side={isMobile ? "bottom" : "right"}>
          <SheetHeader className="p-6 pb-2">
            <SheetTitle>Add New Health Entry</SheetTitle>
          </SheetHeader>
          <ManualEntryForm onAddEntry={handleAddEntry} onClose={() => setIsSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
