import { BrowserRouter, Route, Routes } from "react-router";
import { AuthGate } from "@/components/AuthGate";
import { ColumnLayout, Layout } from "@/components/Layout";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { Dashboard } from "@/pages/Dashboard";
import { HassPage } from "@/pages/HassPage";
import { LightsPage } from "@/pages/LightsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TaskDetailPage } from "@/pages/TaskDetailPage";
import { TaskListPage } from "@/pages/TaskListPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <WebSocketProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route element={<ColumnLayout />}>
                <Route index element={<Dashboard />} />
                <Route
                  path="cleaning"
                  element={<TaskListPage kind="cleaning" />}
                />
                <Route path="plants" element={<TaskListPage kind="plants" />} />
                <Route path="house" element={<TaskListPage kind="house" />} />
                <Route path="tasks/:id" element={<TaskDetailPage />} />
                <Route path="lights" element={<LightsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="hass" element={<HassPage />} />
            </Route>
          </Routes>
        </WebSocketProvider>
      </AuthGate>
    </BrowserRouter>
  );
}
