import { useContext } from "react";
import {
  BrowserRouter,
  Outlet,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import { AppContext } from "./common/app-context";
import GlobalHeader from "./components/global-header";
import Playground from "./pages/chatbot/playground/playground";
import DataPage from "./pages/admin/data-view-page";
import UserFeedbackPage from "./pages/admin/user-feedback-page";
import SessionPage from "./pages/chatbot/sessions/sessions";
import Welcome from "./pages/landing-page/basePage";
import Checklists from "./pages/requirements-gathering/checklist"; // Import the new Checklists page
import { useState } from "react";
//import { v4 as uuidv4 } from "uuid";
import "./styles/app.scss";
import { Mode } from "@cloudscape-design/global-styles";
import { StorageHelper } from "./common/helpers/storage-helper";

function App() {
  const appContext = useContext(AppContext);
  const Router = BrowserRouter;
  const [theme, setTheme] = useState<Mode>(StorageHelper.getTheme());

  return (
    <div style={{ height: "100%" }}>
      <Router>
        <GlobalHeader />
        <div style={{ height: "56px", backgroundColor: "#000716" }}>&nbsp;</div>
        <div>
          <Routes>
            <Route
              index
              path="/"
              element={<Navigate to={`/landing-page/basePage`} replace />} // root path
            />
            <Route path="/landing-page/basePage" element={<Outlet />}>
              <Route path="" element={<Welcome theme={theme} />} />
              {/* <Route path="checklists/:documentUrl" element={<Checklists />} /> */}
              {/* Route for the checklists page with a dynamic parameter */}
            <Route
              path="/landing-page/basePage/checklists/:documentUrl"
              element={<Checklists />}
            />
            </Route>
            <Route path="/chatbot" element={<Outlet />}>
              <Route path="playground/:sessionId" element={<Playground />} />
              <Route path="sessions" element={<SessionPage />} />
            </Route>
            <Route path="/admin" element={<Outlet />}>
              <Route path="data" element={<DataPage />} />
              <Route path="user-feedback" element={<UserFeedbackPage />} />
            </Route>
            <Route path="*" element={<Navigate to={`/landing-page/basePage`} replace />} />
          </Routes>
        </div>
      </Router>
    </div>
  );
}

export default App;
