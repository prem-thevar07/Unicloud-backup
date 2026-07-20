import { useEffect, useState } from "react";
import api from "../config/api";
import "../styles/manageAccounts.css";
import MainLayout from "../layouts/MainLayout";

const providerIcons = {
  google: "/assets/drive.png",
  onedrive: "/assets/onedrive.png",
  dropbox: "/assets/dropbox.png",
  s3: "/assets/s3.png",
  box: "/assets/box.png",
};

const ManageAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [activeProvider, setActiveProvider] = useState("all");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  // Amazon S3 States
  const [s3ModalOpen, setS3ModalOpen] = useState(false);
  const [s3Creds, setS3Creds] = useState({
    email: "",
    accessKeyId: "",
    secretAccessKey: "",
    region: "us-east-1",
    bucketName: ""
  });
  const [bucketsList, setBucketsList] = useState([]);
  const [fetchingBuckets, setFetchingBuckets] = useState(false);
  const [connectingS3, setConnectingS3] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Auto-select first visible account when provider tab changes
  useEffect(() => {
    if (accounts.length > 0) {
      const visible = activeProvider === "all" ? accounts : accounts.filter(a => a.provider === activeProvider);
      if (!visible.some(a => a._id === selected?._id)) {
        setSelected(visible[0] || null);
      }
    } else {
      setSelected(null);
    }
  }, [activeProvider, accounts]);

  /* ===============================
     FETCH ACCOUNTS
  =============================== */
  const fetchAccounts = async () => {
    try {
      console.log("📡 Fetching accounts...");
      const res = await api.get("/accounts");

      // ✅ FIX: always array
      setAccounts(res.data || []);
    } catch (err) {
      console.error("❌ Fetch accounts error:", err);
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     CONNECT GOOGLE
  =============================== */
  const connectGoogle = () => {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Please login again");
      return;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
    window.location.href = `${baseUrl}/google/connect?token=${token}`;
  };

  /* ===============================
     CONNECT DROPBOX
  =============================== */
  const connectDropbox = () => {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Please login again");
      return;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
    window.location.href = `${baseUrl}/dropbox/connect?token=${token}`;
  };

  /* ===============================
     CONNECT ONEDRIVE
  =============================== */
  const connectOneDrive = () => {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Please login again");
      return;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
    window.location.href = `${baseUrl}/onedrive/connect?token=${token}`;
  };

  /* ===============================
     CONNECT BOX
  =============================== */
  const connectBox = () => {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Please login again");
      return;
    }

    const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
    window.location.href = `${baseUrl}/box/connect?token=${token}`;
  };

  /* ===============================
     🔌 CONNECT AMAZON S3
  =============================== */
  const handleFetchBuckets = async (e) => {
    e.preventDefault();
    if (!s3Creds.accessKeyId || !s3Creds.secretAccessKey) {
      alert("Please enter both Access Key ID and Secret Access Key");
      return;
    }
    setFetchingBuckets(true);
    try {
      const res = await api.post("/s3/buckets", {
        accessKeyId: s3Creds.accessKeyId,
        secretAccessKey: s3Creds.secretAccessKey,
        region: s3Creds.region
      });
      const buckets = res.data.buckets || [];
      setBucketsList(buckets);
      if (buckets.length > 0) {
        setS3Creds(prev => ({ ...prev, bucketName: buckets[0] }));
      } else {
        alert("No buckets found in this AWS account.");
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to load buckets. Verify your credentials.");
    } finally {
      setFetchingBuckets(false);
    }
  };

  const handleConnectS3 = async (e) => {
    e.preventDefault();
    if (!s3Creds.email || !s3Creds.accessKeyId || !s3Creds.secretAccessKey || !s3Creds.bucketName) {
      alert("All fields are required. Please load and select a bucket.");
      return;
    }
    setConnectingS3(true);
    try {
      await api.post("/s3/connect", s3Creds);
      setS3ModalOpen(false);
      setS3Creds({ email: "", accessKeyId: "", secretAccessKey: "", region: "us-east-1", bucketName: "" });
      setBucketsList([]);
      fetchAccounts();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to connect to the selected S3 bucket.");
    } finally {
      setConnectingS3(false);
    }
  };

  /* ===============================
     DELETE ACCOUNT
  =============================== */
  const deleteAccount = async (id) => {
    if (!confirm("Disconnect this account?")) return;

    try {
      await api.delete(`/accounts/${id}`);
      fetchAccounts();
      setSelected(null);
    } catch (err) {
      console.error("❌ Delete failed:", err);
    }
  };

  /* ===============================
     SYNC ACCOUNT
  =============================== */
  const triggerSync = async (id) => {
    try {
      console.log("🔄 Sync:", id);

      const acc = accounts.find(a => a._id === id);
      if (!acc) return;

      if (acc.provider === "dropbox") {
        await api.post(`/dropbox/sync/${id}`);
      } else if (acc.provider === "onedrive") {
        await api.post(`/onedrive/sync/${id}`);
      } else if (acc.provider === "s3") {
        await api.post(`/s3/sync/${id}`);
      } else if (acc.provider === "box") {
        await api.post(`/box/sync/${id}`);
      } else {
        await api.post(`/google/sync/${id}`);
      }

      fetchAccounts();
    } catch (err) {
      console.error("❌ Sync failed:", err);
    }
  };

  /* ===============================
     FILTER
  =============================== */
  const providers = [...new Set(accounts.map(a => a.provider))];

  const visibleAccounts =
    activeProvider === "all"
      ? accounts
      : accounts.filter(a => a.provider === activeProvider);

  return (
    <MainLayout>
      <div className="accounts-page">

        {/* HEADER */}
        <div className="topbar">
          <div>
            <h2>Manage Cloud Accounts</h2>
            <p>Connect and manage multiple providers</p>
          </div>

          <div className="add-accounts-group">
            <button className="add-btn" onClick={connectGoogle}>
              <img src="/assets/drive.png" alt="Google Drive" className="btn-provider-logo" />
              <span>Add Google Account</span>
            </button>
            <button className="add-btn" onClick={connectDropbox}>
              <img src="/assets/dropbox.png" alt="Dropbox" className="btn-provider-logo" />
              <span>Add Dropbox Account</span>
            </button>
            <button className="add-btn" onClick={connectOneDrive}>
              <img src="/assets/onedrive.png" alt="OneDrive" className="btn-provider-logo" />
              <span>Add OneDrive Account</span>
            </button>
            <button className="add-btn" onClick={() => setS3ModalOpen(true)}>
              <img src="/assets/s3.png" alt="Amazon S3" className="btn-provider-logo" />
              <span>Add Amazon S3</span>
            </button>
            <button className="add-btn add-btn-box" onClick={connectBox}>
              <img src="/assets/box.png" alt="Box" className="btn-provider-logo" />
              <span>Add Box Account</span>
            </button>
          </div>
        </div>

        {/* FILTER TABS */}
        <div className="tabs">
          <button
            className={activeProvider === "all" ? "active" : ""}
            onClick={() => setActiveProvider("all")}
          >
            All
          </button>

          {providers.map((p) => (
            <button
              key={p}
              className={activeProvider === p ? "active" : ""}
              onClick={() => setActiveProvider(p)}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="content">

          {/* LEFT */}
          <div className="accounts-grid">

            {loading && <p>Loading...</p>}

            {!loading && (
              <>
                {visibleAccounts.map((acc) => (
                  <div
                    key={acc._id}
                    className={`account-card ${selected?._id === acc._id ? "selected" : ""
                      }`}
                    onClick={() => setSelected(acc)}
                  >
                    {/* HEADER */}
                    <div className="card-top">
                      <img
                        src={providerIcons[acc.provider]}
                        alt={acc.provider}
                      />
                      <span className={`status ${acc.status}`}>
                        {acc.status || "connected"}
                      </span>
                    </div>

                    {/* EMAIL */}
                    <h4 title={acc.email}>
                      {acc.email || "Unknown account"}
                    </h4>

                    {/* STORAGE */}
                    <div className="storage">
                      <div className="bar">
                        <div
                          className="fill"
                          style={{
                            width: `${getPercent(
                              acc.storage?.used,
                              acc.storage?.total
                            )}%`,
                          }}
                        />
                      </div>

                      <small>
                        {formatSize(acc.storage?.used)} /{" "}
                        {formatSize(acc.storage?.total)}
                      </small>
                    </div>

                    {/* LAST SYNC */}
                    <small className="last-sync-text">
                      Last sync:{" "}
                      {acc.lastSyncedAt
                        ? new Date(acc.lastSyncedAt).toLocaleString()
                        : "Never"}
                    </small>

                    {/* ACTIONS */}
                    <div className="actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerSync(acc._id);
                        }}
                      >
                        Sync
                      </button>

                      <button
                        className="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteAccount(acc._id);
                        }}
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ))}

              </>
            )}
          </div>

        </div>
      </div>

      {s3ModalOpen && (
        <div className="s3-modal-overlay" onClick={() => setS3ModalOpen(false)}>
          <div className="s3-modal-content glass" onClick={(e) => e.stopPropagation()}>
            <div className="s3-modal-header">
              <h3>Connect Amazon S3 Bucket</h3>
              <button className="s3-close-btn" onClick={() => setS3ModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleConnectS3} className="s3-form">
              <div className="form-group">
                <label>Account Label (Email or Name)</label>
                <input
                  type="email"
                  placeholder="e.g. personal-bucket@aws.com"
                  value={s3Creds.email}
                  onChange={(e) => setS3Creds({ ...s3Creds, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>AWS Access Key ID</label>
                <input
                  type="text"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={s3Creds.accessKeyId}
                  onChange={(e) => setS3Creds({ ...s3Creds, accessKeyId: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>AWS Secret Access Key</label>
                <input
                  type="password"
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  value={s3Creds.secretAccessKey}
                  onChange={(e) => setS3Creds({ ...s3Creds, secretAccessKey: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group half">
                  <label>AWS Region</label>
                  <input
                    type="text"
                    placeholder="us-east-1"
                    value={s3Creds.region}
                    onChange={(e) => setS3Creds({ ...s3Creds, region: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group half" style={{ alignSelf: "flex-end" }}>
                  <button 
                    type="button" 
                    className="load-buckets-btn"
                    onClick={handleFetchBuckets}
                    disabled={fetchingBuckets}
                  >
                    {fetchingBuckets ? "Loading..." : "Load Buckets"}
                  </button>
                </div>
              </div>

              {bucketsList.length > 0 && (
                <div className="form-group">
                  <label>Select Target S3 Bucket</label>
                  <select
                    value={s3Creds.bucketName}
                    onChange={(e) => setS3Creds({ ...s3Creds, bucketName: e.target.value })}
                    required
                  >
                    {bucketsList.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setS3ModalOpen(false)}>Cancel</button>
                <button 
                  type="submit" 
                  className="submit-btn" 
                  disabled={connectingS3 || bucketsList.length === 0}
                >
                  {connectingS3 ? "Connecting..." : "Connect Bucket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default ManageAccounts;

/* ===============================
   UTILS
=============================== */

const getPercent = (used = 0, total = 1) => {
  if (!total) return 0;
  return Math.min((used / total) * 100, 100);
};

const formatSize = (bytes) => {
  if (!bytes) return "0 B";

  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
};