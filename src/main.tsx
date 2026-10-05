import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { Host } from "./pages/Host";
import { Play } from "./pages/Play";
import { Grain } from "./components/Grain";
import { UpdateBanner } from "./components/UpdateBanner";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Grain />
      <UpdateBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host/:code" element={<Host />} />
        <Route path="/play/:code" element={<Play />} />
        <Route path="/:code" element={<Home />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
