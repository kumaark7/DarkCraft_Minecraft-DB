import { useState, createContext, useContext, type ReactNode } from 'react';

interface LayoutContextValue {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const LayoutContext = createContext<LayoutContextValue>({
  sidebarCollapsed: false,
  setSidebarCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
});

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <LayoutContext.Provider value={{ sidebarCollapsed, setSidebarCollapsed, mobileOpen, setMobileOpen }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}
