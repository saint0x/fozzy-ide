import { create } from 'zustand';
import type { EditorTab } from '@/types';

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  openFile: (filePath: string, fileName: string, language: string, content: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  markSaved: (id: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tabs: [],
  activeTabId: null,

  openFile: (filePath, fileName, language, content) =>
    set((s) => {
      const existing = s.tabs.find((t) => t.filePath === filePath);
      if (existing) {
        return { activeTabId: existing.id };
      }
      const tab: EditorTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        filePath,
        fileName,
        language,
        dirty: false,
        content,
      };
      return { tabs: [...s.tabs, tab], activeTabId: tab.id };
    }),

  closeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const next = s.tabs.filter((t) => t.id !== id);
      let activeTabId = s.activeTabId;
      if (activeTabId === id) {
        // Activate the nearest remaining tab
        activeTabId =
          next.length === 0
            ? null
            : (next[Math.min(idx, next.length - 1)]?.id ?? null);
      }
      return { tabs: next, activeTabId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content, dirty: true } : t,
      ),
    })),

  markSaved: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirty: false } : t)),
    })),
}));
