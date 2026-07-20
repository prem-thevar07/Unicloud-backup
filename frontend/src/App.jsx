import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AuthSuccess = lazy(() => import("./pages/AuthSuccess"));
const OtpVerify = lazy(() => import("./pages/OtpVerify"));
const Profile = lazy(() => import("./pages/Profile"));
const OAuthSuccess = lazy(() => import("./pages/OAuthSuccess"));
const About = lazy(() => import("./pages/About"));
const Files = lazy(() => import("./pages/Files"));
const ManageAccounts = lazy(() => import("./pages/ManageAccounts"));
const Photos = lazy(() => import("./pages/Photos"));
const Upload = lazy(() => import("./pages/Upload"));
const Optimize = lazy(() => import("./pages/Optimize"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));

function App() {
  return (
    <Suspense fallback={
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0a0c12",
        color: "#ffffff",
        fontFamily: "Inter, sans-serif",
        fontSize: "14px"
      }}>
        <div style={{
          border: "4px solid rgba(255,255,255,0.1)",
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          borderLeftColor: "#7b6cff",
          animation: "spin 1s linear infinite",
          marginRight: "12px"
        }} />
        Loading Unicloud...
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    }>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/verify-otp" element={<OtpVerify />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/success" element={<AuthSuccess />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/oauth-success" element={<OAuthSuccess />} />
        <Route path="/about" element={<About />} />
        <Route path="/files" element={<Files />} />
        <Route path="/manage-accounts" element={<ManageAccounts />} />
        <Route path="/photos" element={<ProtectedRoute><Photos /></ProtectedRoute>} />
        <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/optimize"
          element={
            <ProtectedRoute>
              <Optimize />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

export default App;
