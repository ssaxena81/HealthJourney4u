'use client';

import type { HealthMetricType } from '@/types';
import FilterPanel from '@/components/health/filter-panel';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { AppLogo } from '@/components/icons/app-logo';
import { HealthIcon } from '@/components/icons/health-icons';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarNavProps {
  selectedCategories: HealthMetricType[];
  onCategoryChange: (category: HealthMetricType, checked: boolean) => void;
}

export default function SidebarNav({ selectedCategories, onCategoryChange }: SidebarNavProps) {
  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="hidden md:flex justify-center items-center border-b">
         <AppLogo />
      </SidebarHeader>
      <SidebarContent asChild>
        <ScrollArea className="flex-1">
          <SidebarGroup>
            <FilterPanel
              selectedCategories={selectedCategories}
              onCategoryChange={onCategoryChange}
            />
          </SidebarGroup>
          <SidebarSeparator className="my-4" />
          <SidebarGroup>
            <SidebarGroupLabel className="px-2">Integrations</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton variant="ghost" className="w-full justify-start" disabled tooltip="Coming Soon">
                  <HealthIcon type="quest" className="mr-2 h-5 w-5" />
                  QUEST Diagnostics
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton variant="ghost" className="w-full justify-start" disabled tooltip="Coming Soon">
                  <HealthIcon type="uhc" className="mr-2 h-5 w-5" />
                  United Health Care
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t">
        <Button variant="outline" size="sm" className="w-full" disabled>
          Settings
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
