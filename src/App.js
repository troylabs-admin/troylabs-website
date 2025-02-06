import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import Landing from "./screens/Landing";
import BUILD from "./screens/BUILD";
import Ignite from "./screens/Ignite";
import Header from "./components/Header";
import Team from "./screens/Team";
import Partners from "./screens/Partners";
import { useEffect } from "react";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function App() {
  return (
    <Router>
    <ScrollToTop />
    <Header />
      <Routes>
        <Route element={<Landing />} path="/" />
        <Route element={<BUILD />} path="/build" />
        <Route element={<Ignite />} path="/ignite" />
        <Route element={<Team />} path="/team" />
        <Route element={<Partners />} path="/partners" />
      </Routes>
    </Router>
  );
}

export default App;
