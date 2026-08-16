import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { WizardPage } from './wizard/WizardPage';
import { DashboardPage } from './dashboard/DashboardPage';
import { PlanPage } from './plan/PlanPage';
import { DataSourcesPage } from './components/DataSourcesPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/wizard" replace />} />
          <Route path="/wizard/*" element={<WizardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/data" element={<DataSourcesPage />} />
          <Route path="*" element={<Navigate to="/wizard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
