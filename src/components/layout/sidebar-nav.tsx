
'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { AppLogo } from '@/components/icons/app-logo';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dumbbell, Bed, Heart, UserCircle, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth'; // For logout action

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  action?: () => void; // For logout
}

export default function SidebarNav() {
  const router = useRouter();
  const { logout } = useAuth(); // Assuming useAuth provides a logout function

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const navItems: NavItem[] = [
    { href: '/exercise', label: 'Exercise', icon: Dumbbell }, // TODO: Create /exercise page
    { href: '/sleep', label: 'Sleep', icon: Bed },       // TODO: Create /sleep page
    { href: '/heart', label: 'Heart', icon: Heart },       // TODO: Create /heart page
    { href: '/profile', label: 'Profile', icon: UserCircle },
    { href: '#', label: 'Logout', icon: LogOut, action: handleLogout },
  ];

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="hidden md:flex justify-center items-center border-b">
         <AppLogo />
      </SidebarHeader>
      <SidebarContent asChild>
        <ScrollArea className="flex-1 p-2"> {/* Added p-2 for spacing around menu items */}
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={item.action ? item.action : () => router.push(item.href)}
                  tooltip={{ children: item.label, side: 'right', align: 'center' }}
                  aria-label={item.label}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t">
        {/* Settings button can be added back if needed, or integrated into Profile */}
        {/* <Button variant="outline" size="sm" className="w-full" disabled>
          Settings
        </Button> */}
      </SidebarFooter>
    </Sidebar>
  );
}
