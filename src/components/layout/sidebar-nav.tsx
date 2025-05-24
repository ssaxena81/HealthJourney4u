
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
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dumbbell, Bed, Heart, UserCircle, LogOut, Footprints, Run, Hiking as HikingIcon, Waves } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

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
}

export default function SidebarNav() {
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const navItems: NavItemDef[] = [
    {
      label: 'Exercise',
      icon: Dumbbell,
      href: '/exercise', // Main exercise page
      subItems: [
        { href: '/exercise/walking', label: 'Walking', icon: Footprints },
        { href: '/exercise/running', label: 'Running', icon: Run },
        { href: '/exercise/hiking', label: 'Hiking', icon: HikingIcon },
        { href: '/exercise/swimming', label: 'Swimming', icon: Waves },
      ],
    },
    { href: '/sleep', label: 'Sleep', icon: Bed },
    { href: '/heart', label: 'Heart', icon: Heart },
    { href: '/profile', label: 'Profile', icon: UserCircle },
    { href: '#', label: 'Logout', icon: LogOut, action: handleLogout },
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
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={item.action ? item.action : item.href ? () => router.push(item.href!) : undefined}
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
                          tooltip={{ children: subItem.label, side: 'right', align: 'center' }}
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
