import { Outlet } from 'react-router-dom';
import { SidebarNav } from './sidebar-nav';
import { Topbar } from './topbar';
import { BottomDrawer } from './bottom-drawer';
import { CommandPalette } from './command-palette';

export function AppShell() {
  return (
    <div className="flex h-screen w-screen bg-bg-primary text-text-primary overflow-hidden">
      {/* Sidebar */}
      <SidebarNav />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

        {/* Bottom drawer */}
        <BottomDrawer />
      </div>

      {/* Command palette overlay */}
      <CommandPalette />
    </div>
  );
}
