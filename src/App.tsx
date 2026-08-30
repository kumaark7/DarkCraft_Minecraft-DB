import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import { routes, type RouteConfig } from './routes';

function renderRoutes(routeList: RouteConfig[]) {
  return routeList.map((route, index) => (
    <Route key={index} path={route.path} element={route.element}>
      {route.children && renderRoutes(route.children)}
    </Route>
  ));
}

const App: React.FC = () => {
  return (
    <Router>
      <IntersectObserver />
      <div className="flex flex-col min-h-screen">
        <main className="flex-grow">
          <Routes>
            {renderRoutes(routes)}
          </Routes>
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </Router>
  );
};

export default App;
