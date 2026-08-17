import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { WizardPage } from './wizard/WizardPage';
import { DashboardPage } from './dashboard/DashboardPage';
import { PlanPage } from './plan/PlanPage';
import { DataSourcesPage } from './components/DataSourcesPage';
import { DemoRoute } from './components/Demo';

/** The route table, without a router — so tests can mount it inside a MemoryRouter. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/wizard" replace />} />
        <Route path="/wizard/*" element={<WizardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/data" element={<DataSourcesPage />} />
        <Route path="/demo" element={<DemoRoute />} />
        <Route path="*" element={<Navigate to="/wizard" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
