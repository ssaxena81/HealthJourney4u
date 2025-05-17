'use client';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { PlusCircle } from 'lucide-react';
import { AppLogo } from '@/components/icons/app-logo';

interface AppHeaderProps {
  onAddEntryClick: () => void;
}

export default function AppHeader({ onAddEntryClick }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <SidebarTrigger className="md:hidden" />
      <div className="flex-1">
        <AppLogo />
      </div>
      <Button onClick={onAddEntryClick} size="sm" className="shadow-sm">
        <PlusCircle className="mr-2 h-4 w-4" />
        Add Entry
      </Button>
    </header>
  );
}
