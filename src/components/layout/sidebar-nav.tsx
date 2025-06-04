
'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import { AppLogo } from '@/components/icons/app-logo';
// import { Button } from '@/components/ui/button'; // No longer used for settings button here
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dumbbell, Bed, Heart, UserCircle, LogOut, Footprints, Mountain as HikingIcon, Waves, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import React from 'react'; // Import React for SVG component

// Inline SVG for the Run icon
const RunIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="5" r="1" />
    <path d="M12 20a5 5 0 0 0-4.2-7.8c.2-.2.3-.5.3-.8l.2-1.5c.1-.4 0-.8-.4-1L6 7.4V6h3.5c.4 0 .8.2 1.1.5l1.5 1.5" />
    <path d="M16 10h4l-2 4-2-4" />
    <path d="m7.5 9.5 2 5L11 18l2-4-1.5-3z" />
  </svg>
);


interface SubNavItemDef {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavItemDef {
  href?: string; // Optional if it's a parent for a submenu and doesn't navigate itself
  label: string;
  icon: React.ElementType;
  action?: () => void;
  subItems?: SubNavItemDef[];
  disabled?: boolean; // For disabling sync button based on tier (handled by caller for now)
}

interface SidebarNavProps {
    onSyncAllClick?: () => Promise<void>; // Make it optional
}

export default function SidebarNav({ onSyncAllClick }: SidebarNavProps) {
  const router = useRouter();
  const { user, userProfile, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };
  
  // Determine if the sync button should be enabled
  // Platinum users can always sync. Others rely on rate limits within individual actions.
  // The auto-sync logic is in AuthenticatedAppLayout.
  // For simplicity here, the button is always enabled, and the server actions handle rate limits.
  // const isSyncButtonEnabled = userProfile?.subscriptionTier === 'platinum';


  const navItems: NavItemDef[] = [
    {
      label: 'Exercise',
      icon: Dumbbell,
      href: '/exercise', // Main exercise page
      subItems: [
        { href: '/exercise/walking', label: 'Walking', icon: Footprints },
        { href: '/exercise/running', label: 'Running', icon: RunIcon },
        { href: '/exercise/hiking', label: 'Hiking', icon: HikingIcon },
        { href: '/exercise/swimming', label: 'Swimming', icon: Waves },
      ],
    },
    { href: '/sleep', label: 'Sleep', icon: Bed },
    { href: '/heart', label: 'Heart', icon: Heart },
    {
      label: 'Sync Apps',
      icon: RefreshCw,
      action: onSyncAllClick,
      // disabled: !isSyncButtonEnabled // Let individual actions handle rate limits
    },
    { href: '/profile', label: 'Profile', icon: UserCircle },
    { label: 'Logout', icon: LogOut, action: handleLogout },
  ];

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="hidden md:flex justify-center items-center border-b">
         <AppLogo />
      </SidebarHeader>
      <SidebarContent asChild>
        <ScrollArea className="flex-1 p-2">
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  variant="default"
                  className="w-full justify-start"
                  onClick={item.action ? item.action : item.href ? () => router.push(item.href!) : undefined}
                  disabled={item.disabled}
                  tooltip={{ children: item.label, side: 'right', align: 'center' }}
                  aria-label={item.label}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                </SidebarMenuButton>
                {item.subItems && (
                  <SidebarMenuSub>
                    {item.subItems.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.label}>
                        <SidebarMenuSubButton
                          onClick={() => router.push(subItem.href)}
                          aria-label={subItem.label}
                        >
                          <subItem.icon className="h-5 w-5" />
                          <span className="group-data-[collapsible=icon]:hidden">{subItem.label}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t">
        {/* Settings button can be added back if needed, or integrated into Profile */}
      </SidebarFooter>
    </Sidebar>
  );
}
