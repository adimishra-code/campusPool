import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.jsx";
import CookieConsent from "./components/CookieConsent.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { store } from "./store/store.js";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <HelmetProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <App />
            <CookieConsent />
          </ErrorBoundary>
        </BrowserRouter>
      </HelmetProvider>
    </Provider>
  </React.StrictMode>
);
