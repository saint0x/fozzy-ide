import { create } from 'zustand';

export type DrawerTab = 'terminal' | 'output' | 'problems';
export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface AppNotice {
  id: string;
  title: string;
  message?: string;
  tone: NoticeTone;
}

interface AppState {
  startupState: 'booting' | 'ready' | 'error';
  startupError: string | null;
  storageRoot: string | null;
  dbPath: string | null;
  setStartupState: (state: AppState['startupState']) => void;
  setStartupError: (error: string | null) => void;
  setBootstrapPaths: (paths: { storageRoot: string; dbPath: string }) => void;

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

  // Notices
  notices: AppNotice[];
  pushNotice: (notice: Omit<AppNotice, 'id'>) => string;
  dismissNotice: (id: string) => void;

  // Active workspace
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;

  // Coverage mapping
  coverageMappedWorkspaceIds: string[];
  markCoverageMapped: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  startupState: 'booting',
  startupError: null,
  storageRoot: null,
  dbPath: null,
  setStartupState: (startupState) => set({ startupState }),
  setStartupError: (startupError) => set({ startupError }),
  setBootstrapPaths: ({ storageRoot, dbPath }) => set({ storageRoot, dbPath }),

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

  // Notices
  notices: [],
  pushNotice: (notice) => {
    const id = `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({
      notices: [...state.notices, { id, ...notice }],
    }));
    return id;
  },
  dismissNotice: (id) =>
    set((state) => ({
      notices: state.notices.filter((notice) => notice.id !== id),
    })),

  // Active workspace
  activeWorkspaceId: '',
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  // Coverage mapping
  coverageMappedWorkspaceIds: [],
  markCoverageMapped: (id) =>
    set((state) => ({
      coverageMappedWorkspaceIds: state.coverageMappedWorkspaceIds.includes(id)
        ? state.coverageMappedWorkspaceIds
        : [...state.coverageMappedWorkspaceIds, id],
    })),
}));
