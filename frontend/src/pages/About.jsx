import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { SITE_NAME } from "../config/siteConfig";
import "../styles/about.css";

const About = () => {
  const navigate = useNavigate();
  const isLoggedIn = !!localStorage.getItem("token");

  const handleAction = () => {
    navigate(isLoggedIn ? "/dashboard" : "/auth");
  };

  const providers = [
    { name: "Google Drive", logo: "/assets/drive.png", badge: "OAuth 2.0", desc: "Full folder hierarchy, file search, and instant downloads." },
    { name: "OneDrive", logo: "/assets/onedrive.png", badge: "OAuth 2.0", desc: "Seamless Microsoft cloud integration & storage metering." },
    { name: "Dropbox", logo: "/assets/dropbox.png", badge: "OAuth 2.0", desc: "Personal & team workspace sync with active change tracking." },
    { name: "Amazon S3", logo: "/assets/s3.png", badge: "IAM Keys", desc: "Custom S3 bucket links using region-isolated Access Keys." },
    { name: "Box.com", logo: "/assets/box.png", badge: "OAuth 2.0", desc: "Enterprise developer folder indexing & file metadata sync." },
  ];

  return (
    <>
      <Header />

      <main className="about-main">
        {/* HERO SECTION */}
        <section className="about-hero">
          <span className="about-badge">✦ NEXT-GEN MULTI-CLOUD WORKSPACE</span>
          <h1>Unifying Your Digital Universe</h1>
          <p>
            {SITE_NAME} is an all-in-one cloud management hub engineered to bridge 
            Google Drive, OneDrive, Dropbox, Amazon S3, and Box into a single, high-performance workspace.
          </p>
          <div className="about-hero-actions">
            <button className="about-btn-primary" onClick={handleAction}>
              {isLoggedIn ? "Open Dashboard" : "Get Started Free"}
            </button>
          </div>
        </section>

        {/* METRICS / HIGHLIGHTS BAR */}
        <section className="about-metrics-bar">
          <div className="metric-item">
            <h3>6+</h3>
            <p>Cloud Networks</p>
          </div>
          <div className="metric-item">
            <h3>5 GB</h3>
            <p>Stream Capacity</p>
          </div>
          <div className="metric-item">
            <h3>100%</h3>
            <p>Password-Free (OAuth)</p>
          </div>
          <div className="metric-item">
            <h3>Instant</h3>
            <p>Unified Search</p>
          </div>
        </section>

        {/* CORE PILLARS SECTION */}
        <section className="about-section">
          <div className="section-title-center">
            <span className="section-subtitle">WHY UNICLOUD?</span>
            <h2>Eliminating Cloud Fragmentation</h2>
          </div>

          <div className="about-grid">
            <div className="about-card">
              <div className="card-icon">⚡</div>
              <h3>The Fragmentation Problem</h3>
              <p>
                Managing separate accounts for personal Google Drive, work OneDrive, S3 storage, 
                and Dropbox forces constant tab switching, lost credentials, and wasted storage quotas.
              </p>
              <p>
                {SITE_NAME} solves this by unifying all your files under one clean, responsive dashboard.
              </p>
            </div>

            <div className="about-card">
              <div className="card-icon">⚙️</div>
              <h3>Intelligent Architecture</h3>
              <p>
                Unicloud uses Node.js disk-streaming algorithms to stream files directly between 
                your device and cloud providers without storing your files on third-party servers.
              </p>
              <p>
                Smart backend caching guarantees zero-latency browsing across thousands of remote files.
              </p>
            </div>

            <div className="about-card">
              <div className="card-icon">🛡️</div>
              <h3>Zero-Trust Data Security</h3>
              <p>
                Connected cloud services use official OAuth 2.0 mechanisms. We never store or ask for 
                your cloud passwords.
              </p>
              <p>
                User accounts are fortified with OTP email verification, encrypted sessions, and full activity audit logs.
              </p>
            </div>
          </div>
        </section>

        {/* FEATURE CAPABILITIES GRID */}
        <section className="about-section">
          <div className="section-title-center">
            <span className="section-subtitle">CAPABILITIES</span>
            <h2>Core Features Engine</h2>
          </div>

          <div className="features-grid">
            <div className="feature-item">
              <span className="feature-emoji">🔍</span>
              <h4>Unified Multi-Cloud Search</h4>
              <p>Instantly search by name or extension across Google Drive, OneDrive, Dropbox, S3, and Box from one search bar.</p>
            </div>

            <div className="feature-item">
              <span className="feature-emoji">⚖️</span>
              <h4>Smart Quota Router</h4>
              <p>Auto-scans connected drives before uploading and routes large files up to 5GB into the cloud account with maximum free space.</p>
            </div>

            <div className="feature-item">
              <span className="feature-emoji">🖼️</span>
              <h4>Infinite Media Gallery</h4>
              <p>Browse photos and videos cached across all connected accounts in a single responsive media feed equipped with lightbox preview.</p>
            </div>

            <div className="feature-item">
              <span className="feature-emoji">🧹</span>
              <h4>Storage Cleaner & Optimizer</h4>
              <p>Identifies duplicate files and space hogs (&gt;50MB) across different drives, allowing 1-click reclaimable space cleanup.</p>
            </div>

            <div className="feature-item">
              <span className="feature-emoji">🌲</span>
              <h4>Cascading Hover Explorer</h4>
              <p>Browse directories using expandable tree view or Mac Finder-style cascading flyouts that follow your cursor.</p>
            </div>

            <div className="feature-item">
              <span className="feature-emoji">📊</span>
              <h4>Activity Audit Timeline</h4>
              <p>Track uploads, folder creations, service unlinks, and login security events in real-time timeline logs.</p>
            </div>
          </div>
        </section>

        {/* SUPPORTED CLOUDS SECTION */}
        <section className="about-section">
          <div className="section-title-center">
            <span className="section-subtitle">ECOSYSTEM</span>
            <h2>Supported Cloud Networks</h2>
          </div>

          <div className="providers-grid">
            {providers.map((p) => (
              <div key={p.name} className="provider-card">
                <img src={p.logo} alt={p.name} className="provider-logo" />
                <div className="provider-info">
                  <div className="provider-header">
                    <h3>{p.name}</h3>
                    <span className="auth-badge">{p.badge}</span>
                  </div>
                  <p>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA BANNER */}
        <section className="about-cta-section">
          <div className="about-cta-card">
            <h2>Ready to Streamline Your Storage?</h2>
            <p>Connect Google Drive, OneDrive, S3, Dropbox, and Box in under 60 seconds.</p>
            <button className="about-btn-primary" onClick={handleAction}>
              {isLoggedIn ? "Go To Workspace Dashboard" : "Create Your Free Account"}
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default About;

