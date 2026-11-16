import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "react-query";
import { DeviceProvider } from "./hooks/DeviceProvider";
import App from "./App";
import "./i18n";
import "./styles/index.css";
import "./styles/ux-journeys-v3.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DeviceProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DeviceProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
