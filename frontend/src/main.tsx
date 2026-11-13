import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./mvp/App";
import { PortalRoot } from "./portal/Portal";
import "./mvp/tailwind.css";
import "./mvp/styles.css";
import "./portal/portal.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PortalRoot fallback={<App />} />
    </BrowserRouter>
  </React.StrictMode>
);
