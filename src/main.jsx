// The storage shim must be imported first so `window.storage` exists
// before PickleballOpenPlay (or anything else) tries to use it.
import "./storage.js";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
