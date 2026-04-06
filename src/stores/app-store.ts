import { create } from 'zustand';

export type DrawerTab = 'terminal' | 'output' | 'problems';

interface AppState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Active section
  activeSection: string;
  setActiveSection: (section: string) => void;

  // Bottom drawer
  drawerOpen: boolean;
  drawerHeight: number;
  drawerTab: DrawerTab;
  toggleDrawer: () => void;
  setDrawerHeight: (height: number) => void;
  setDrawerTab: (tab: DrawerTab) => void;

  // Command palette
  commandPaletteOpen: boolean;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;

  // Active workspace
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Active section
  activeSection: 'overview',
  setActiveSection: (section) => set({ activeSection: section }),

  // Bottom drawer
  drawerOpen: false,
  drawerHeight: 240,
  drawerTab: 'terminal',
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  setDrawerHeight: (height) => set({ drawerHeight: height }),
  setDrawerTab: (tab) => set({ drawerTab: tab, drawerOpen: true }),

  // Command palette
  commandPaletteOpen: false,
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  // Active workspace
  activeWorkspaceId: 'ws-001',
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
}));
