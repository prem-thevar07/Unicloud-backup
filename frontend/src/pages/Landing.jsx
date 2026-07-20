import Header from "../components/Header";
import Footer from "../components/Footer";
import {
  TAGLINE,
  DESCRIPTION,
  SITE_NAME
} from "../config/siteConfig";
import { Link, useNavigate } from "react-router-dom";
import "../styles/landing.css";

const Landing = () => {
  const navigate = useNavigate();
  const isLoggedIn = !!localStorage.getItem("token");

  const handlePrimaryAction = () => {
    navigate(isLoggedIn ? "/dashboard" : "/auth");
  };

  const integrations = [
    { name: "Google Drive", img: "/assets/drive.png", desc: "Sync docs, sheets, and storage automatically.", color: "#34a853" },
    { name: "Dropbox", img: "/assets/dropbox.png", desc: "Integrate team spaces and personal media securely.", color: "#0061ff" },
    { name: "OneDrive", img: "/assets/onedrive.png", desc: "Bridge Microsoft storage cards and direct downloads.", color: "#0078d4" },
    { name: "Amazon S3", img: "/assets/s3.png", desc: "Link S3 buckets using region-configured Access Keys.", color: "#ff9900" },
    { name: "Box.com", img: "/assets/box.png", desc: "Auth via secure OAuth2 to manage developers folders.", color: "#0061d5" },
  ];

  return (
    <>
      <Header />

      <main className="landing-main">
        {/* HERO */}
        <section className="hero hero-centered">
          <div className="hero-text">
            <span className="hero-badge">Multi-Cloud Workspace Hub</span>
            <h1>{TAGLINE}</h1>
            <p>{DESCRIPTION}</p>

            <div className="hero-actions">
              <button className="btn-primary" onClick={handlePrimaryAction}>
                {isLoggedIn ? "Open Dashboard" : "Get Started Now"}
              </button>
            </div>
          </div>
        </section>

        {/* CONNECTED CLOUD INTEGRATIONS GRID */}
        <section className="integrations-section">
          <div className="section-header-centered">
            <span className="subtitle">ACTIVE CLOUD PROVIDERS</span>
            <h2>Integrated Cloud Ecosystem</h2>
            <p>Connect multiple accounts across different storage networks and manage them from one unified screen.</p>
          </div>

          <div className="integrations-grid">
            {integrations.map((item) => (
              <div key={item.name} className="integration-card" style={{ "--border-glow": item.color }}>
                <span className="provider-card-icon" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '16px', textShadow: `0 0 16px ${item.color}40` }}>
                  <img src={item.img} alt={item.name} style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                </span>
                <h3>{item.name}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* WORKFLOW / DETAILS SECTION */}
        <section className="features-showcase">
          <div className="section-header-centered">
            <span className="subtitle">HOW IT WORKS</span>
            <h2>Supercharged Storage Management</h2>
            <p>Experience advanced folder indexing, real-time activity metrics, and intelligent content routing.</p>
          </div>

          <div className="workflow-section">
            <div className="workflow-step">
              <div className="step-icon">🌲</div>
              <span>NAVIGATION MODE</span>
              <h3>Cascading Hover Explorer</h3>
              <p>Toggle between expandable Classic Trees and Mac Finder-style cascading flyouts that align vertically to your cursor for seamless folder browsing.</p>
            </div>

            <div className="workflow-step">
              <div className="step-icon">⚖️</div>
              <span>BALANCER</span>
              <h3>Smart Storage Uploader</h3>
              <p>Upload files up to 5GB. Unicloud's smart routing algorithm queries connected quotas to auto-assign files to the provider with the most free space.</p>
            </div>

            <div className="workflow-step">
              <div className="step-icon">🖼️</div>
              <span>MEDIA FEED</span>
              <h3>Infinite Photos Gallery</h3>
              <p>Browse cached snapshots, images, and videos from S3, Drive, and Dropbox in a unified, infinite-scrolling responsive grid.</p>
            </div>

            <div className="workflow-step">
              <div className="step-icon">📊</div>
              <span>SECURITY & AUDITS</span>
              <h3>Unified Logs Timeline</h3>
              <p>Keep track of file uploads, folder additions, S3 connections, and Dropbox sync status with a comprehensive activity dashboard feed.</p>
            </div>
          </div>
        </section>

        {/* CTA SECTION */}
        <section className="cta-section">
          <div className="cta-box">
            <h3>Simplify your cloud. Today.</h3>
            <p>Connect Google Drive, OneDrive, S3, Dropbox, and Box in under 60 seconds. Start managing your space like a pro.</p>
            <button className="btn-primary" onClick={handlePrimaryAction}>
              {isLoggedIn ? "Open Dashboard" : "Create Free Account"}
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default Landing;
