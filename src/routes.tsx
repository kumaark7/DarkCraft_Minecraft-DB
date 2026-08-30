import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';

// Global pages
import DashboardPage from './pages/DashboardPage';
import ServersPage from './pages/ServersPage';
import AddServerPage from './pages/AddServerPage';
import CreateServerPage from './pages/CreateServerPage';
import ImportServerPage from './pages/ImportServerPage';
import BotsPage from './pages/BotsPage';
import ActivityPage from './pages/ActivityPage';
import LogsPage from './pages/LogsPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';

// Server management — shell + tab pages
import ServerManagementPage from './pages/server/ServerManagementPage';
import ServerOverviewTab from './pages/server/ServerOverviewTab';
import ServerConsoleTab from './pages/server/ServerConsoleTab';
import ServerPlayersTab from './pages/server/ServerPlayersTab';
import ServerFilesTab from './pages/server/ServerFilesTab';
import ServerPluginsTab from './pages/server/ServerPluginsTab';
import ServerBackupsTab from './pages/server/ServerBackupsTab';
import ServerSchedulesTab from './pages/server/ServerSchedulesTab';
import ServerSettingsTab from './pages/server/ServerSettingsTab';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  children?: RouteConfig[];
  public?: boolean;
}

export const routes: RouteConfig[] = [
  // Root → Dashboard
  { name: 'Dashboard', path: '/', element: <DashboardPage />, public: true },

  // Servers
  { name: 'Servers', path: '/servers', element: <ServersPage />, public: true },
  { name: 'Add Server', path: '/servers/new', element: <AddServerPage />, public: true },
  { name: 'Create Server', path: '/servers/new/create', element: <CreateServerPage />, public: true },
  { name: 'Import Server', path: '/servers/new/import', element: <ImportServerPage />, public: true },

  // Server management area with nested tab routes (handled via Outlet in ServerManagementPage)
  // These are registered as flat routes; ServerManagementPage uses <Outlet /> for tab content
  {
    name: 'Server Management',
    path: '/servers/:id',
    element: <ServerManagementPage />,
    public: true,
    children: [
      { name: 'Overview', path: '', element: <ServerOverviewTab /> },
      { name: 'Console', path: 'console', element: <ServerConsoleTab /> },
      { name: 'Players', path: 'players', element: <ServerPlayersTab /> },
      { name: 'Files', path: 'files', element: <ServerFilesTab /> },
      { name: 'Plugins', path: 'plugins', element: <ServerPluginsTab /> },
      { name: 'Backups', path: 'backups', element: <ServerBackupsTab /> },
      { name: 'Schedules', path: 'schedules', element: <ServerSchedulesTab /> },
      { name: 'Settings', path: 'settings', element: <ServerSettingsTab /> },
    ],
  },

  // Management
  { name: 'Bots', path: '/bots', element: <BotsPage />, public: true },

  // Monitoring
  { name: 'Activity', path: '/activity', element: <ActivityPage />, public: true },
  { name: 'Logs', path: '/logs', element: <LogsPage />, public: true },

  // System
  { name: 'Notifications', path: '/notifications', element: <NotificationsPage />, public: true },
  { name: 'Settings', path: '/settings', element: <SettingsPage />, public: true },

  // Catch-all
  { name: 'Not Found', path: '*', element: <Navigate to="/" replace /> },
];
