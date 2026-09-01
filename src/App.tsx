import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { routes, type RouteConfig } from './routes';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

function renderRoutes(routeList: RouteConfig[]) {
  return routeList.map((route, index) => (
    <Route key={index} path={route.path} element={route.public ? route.element : <ProtectedRoute>{route.element}</ProtectedRoute>}>
      {route.children && renderRoutes(route.children)}
    </Route>
  ));
}

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <div className="flex flex-col min-h-screen">
          <main className="flex-grow">
            <Routes>
              {renderRoutes(routes)}
            </Routes>
          </main>
        </div>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </Router>
  );
};

export default App;
