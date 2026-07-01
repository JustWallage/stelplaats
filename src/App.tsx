import { BrowserRouter, Route, Routes } from "react-router";
import { AuthGate } from "@/components/AuthGate";
import { ColumnLayout, Layout } from "@/components/Layout";
import { SwipeDeck } from "@/components/SwipeDeck";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { HassPage } from "@/pages/HassPage";
import { TaskDetailPage } from "@/pages/TaskDetailPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <WebSocketProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route element={<SwipeDeck />}>
                <Route index element={null} />
                <Route path="tasks" element={null} />
                <Route path="control" element={null} />
                <Route path="settings" element={null} />
              </Route>
              <Route element={<ColumnLayout />}>
                <Route path="tasks/:id" element={<TaskDetailPage />} />
              </Route>
              <Route path="hass" element={<HassPage />} />
            </Route>
          </Routes>
        </WebSocketProvider>
      </AuthGate>
    </BrowserRouter>
  );
}
