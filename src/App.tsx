import { BrowserRouter, Route, Routes } from "react-router";
import { AuthGate } from "@/components/AuthGate";
import { Layout } from "@/components/Layout";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { Dashboard } from "@/pages/Dashboard";
import { HassPage } from "@/pages/HassPage";
import { TaskDetailPage } from "@/pages/TaskDetailPage";
import { TaskListPage } from "@/pages/TaskListPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <WebSocketProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route
                path="cleaning"
                element={<TaskListPage kind="cleaning" />}
              />
              <Route path="plants" element={<TaskListPage kind="plants" />} />
              <Route path="tasks/:id" element={<TaskDetailPage />} />
              <Route path="hass" element={<HassPage />} />
            </Route>
          </Routes>
        </WebSocketProvider>
      </AuthGate>
    </BrowserRouter>
  );
}
