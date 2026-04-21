import { useEffect, useState } from "react";

const INCOME_BANDS = ["<2L", "2-5L", "5-10L", ">10L"];
const API = import.meta.env.VITE_API_URL ?? "";

const INITIAL_FORM = {
  land_area_acres: "",
  crop_type: "",
  repayment_history_score: "",
  annual_income_band: "<2L",
};

// ─── Score Gauge (SVG arc) ──────────────────────────────────────────────────
function ScoreGauge({ score }) {
  const r = 52;
  const cx = 64;
  const cy = 64;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? "#16a34a" : score >= 40 ? "#d97706" : "#dc2626";

  return (
    <svg width="128" height="128" viewBox="0 0 128 128" aria-label={`Score: ${score} out of 100`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="12"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 64 64)"
        style={{ transition: "stroke-dashoffset 0.7s ease" }}
      />
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize="26" fontWeight="800" fontFamily="inherit">{score}</text>
      <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle"
        fill="#9ca3af" fontSize="11" fontFamily="inherit">/ 100</text>
    </svg>
  );
}

// ─── Drift Badge ────────────────────────────────────────────────────────────
const DRIFT_COLORS = {
  stable: { bg: "#dcfce7", text: "#15803d", dot: "#16a34a" },
  slight_drift: { bg: "#fef9c3", text: "#854d0e", dot: "#ca8a04" },
  significant_drift: { bg: "#fee2e2", text: "#991b1b", dot: "#dc2626" },
  insufficient_data: { bg: "#f1f5f9", text: "#475569", dot: "#94a3b8" },
};
const DRIFT_LABELS = {
  stable: "Stable",
  slight_drift: "Slight Drift",
  significant_drift: "Significant Drift",
  insufficient_data: "Drift: Not enough data yet",
};

function DriftBadge({ drift }) {
  if (!drift) return null;
  const c = DRIFT_COLORS[drift.status] ?? DRIFT_COLORS.insufficient_data;
  return (
    <div style={{ ...s.driftBadge, background: c.bg, color: c.text }}>
      <span style={{ ...s.driftDot, background: c.dot }} />
      <span style={{ fontWeight: 600 }}>Model Drift: </span>
      {DRIFT_LABELS[drift.status] ?? drift.status}
      {drift.psi != null && (
        <span style={{ marginLeft: 6, opacity: 0.75, fontSize: "0.8rem" }}>
          PSI = {drift.psi}
        </span>
      )}
    </div>
  );
}

// ─── Recent Scores Table ────────────────────────────────────────────────────
function RecentScores({ records }) {
  if (!records.length) return null;
  return (
    <div style={s.historyCard}>
      <p style={s.historyTitle}>Recent Scores</p>
      <table style={s.table}>
        <thead>
          <tr>
            {["Crop", "Income Band", "Score", "Top Reason", "Time"].map((h) => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const score = r.score;
            const color = score >= 70 ? "#15803d" : score >= 40 ? "#b45309" : "#b91c1c";
            return (
              <tr key={r.request_id} style={s.tr}>
                <td style={s.td}>{r.crop_type}</td>
                <td style={s.td}>{r.annual_income_band}</td>
                <td style={{ ...s.td, fontWeight: 700, color }}>{score}</td>
                <td style={s.td}>
                  <span style={s.smallTag}>{r.reason_codes[0]}</span>
                </td>
                <td style={{ ...s.td, color: "#9ca3af", fontSize: "0.75rem" }}>
                  {new Date(r.timestamp).toLocaleTimeString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [drift, setDrift] = useState(null);

  async function fetchSideData() {
    const [scoresRes, driftRes] = await Promise.allSettled([
      fetch(`${API}/scores?limit=5`),
      fetch(`${API}/drift`),
    ]);
    if (scoresRes.status === "fulfilled" && scoresRes.value.ok)
      setHistory((await scoresRes.value.json()).records ?? []);
    if (driftRes.status === "fulfilled" && driftRes.value.ok)
      setDrift(await driftRes.value.json());
  }

  useEffect(() => { fetchSideData(); }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch(`${API}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          land_area_acres: parseFloat(form.land_area_acres),
          crop_type: form.crop_type,
          repayment_history_score: parseFloat(form.repayment_history_score),
          annual_income_band: form.annual_income_band,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const detail = data.detail;
        setError(
          Array.isArray(detail)
            ? detail.map((d) => `${d.loc?.slice(1).join(".")} — ${d.msg}`).join("\n")
            : typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)
        );
      } else {
        setResult(data);
        fetchSideData();
      }
    } catch {
      setError("Could not reach the backend. Is it running on port 8000?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div>
            <h1 style={s.headerTitle}>Farmer Credit Scorer</h1>
            <p style={s.headerSub}>SaakhSetu · Arbix AI Solutions</p>
          </div>
          <DriftBadge drift={drift} />
        </div>
      </header>

      <main style={s.main}>
        {/* Left: Form */}
        <section style={s.card}>
          <p style={s.sectionLabel}>Applicant Details</p>
          <form onSubmit={handleSubmit} style={s.form}>
            <FormField label="Land Area (acres)" hint="Must be > 0">
              <input style={s.input} type="number" name="land_area_acres"
                value={form.land_area_acres} onChange={handleChange}
                placeholder="e.g. 5.0" step="any" min="0.01" required />
            </FormField>

            <FormField label="Crop Type" hint="Any crop label">
              <input style={s.input} type="text" name="crop_type"
                value={form.crop_type} onChange={handleChange}
                placeholder="e.g. wheat, rice, cotton" required />
            </FormField>

            <FormField label="Repayment History Score" hint="0 – 100">
              <div style={s.sliderRow}>
                <input style={s.input} type="number" name="repayment_history_score"
                  value={form.repayment_history_score} onChange={handleChange}
                  placeholder="e.g. 75" min="0" max="100" step="any" required />
                {form.repayment_history_score !== "" && (
                  <span style={{
                    ...s.repBadge,
                    background: form.repayment_history_score >= 75 ? "#dcfce7"
                      : form.repayment_history_score >= 40 ? "#fef9c3" : "#fee2e2",
                    color: form.repayment_history_score >= 75 ? "#15803d"
                      : form.repayment_history_score >= 40 ? "#854d0e" : "#991b1b",
                  }}>
                    {form.repayment_history_score >= 75 ? "Good"
                      : form.repayment_history_score >= 40 ? "Average" : "Poor"}
                  </span>
                )}
              </div>
            </FormField>

            <FormField label="Annual Income Band" hint="Select band">
              <select style={s.input} name="annual_income_band"
                value={form.annual_income_band} onChange={handleChange}>
                {INCOME_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </FormField>

            <button style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }}
              type="submit" disabled={loading}>
              {loading ? (
                <span style={s.spinnerRow}><Spinner /> Scoring…</span>
              ) : "Get Score →"}
            </button>
          </form>

          {error && (
            <div style={s.errorBox}>
              <span style={s.errorIcon}>✕</span>
              <div>
                <p style={s.errorTitle}>Validation Error</p>
                <pre style={s.errorPre}>{error}</pre>
              </div>
            </div>
          )}
        </section>

        {/* Right: Result */}
        <section style={{ ...s.card, ...s.resultPanel }}>
          {!result ? (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>📋</div>
              <p style={s.emptyText}>Submit the form to see the credit score and reason codes.</p>
            </div>
          ) : (
            <>
              <p style={s.sectionLabel}>Score Result</p>

              <div style={s.gaugeRow}>
                <ScoreGauge score={result.score} />
                <div style={s.scoreDetails}>
                  <p style={s.scoreHeading}>
                    {result.score >= 70 ? "Low Risk" : result.score >= 40 ? "Medium Risk" : "High Risk"}
                  </p>
                  <p style={s.scoreSubtext}>Credit Score: {result.score} / 100</p>
                </div>
              </div>

              <div style={s.divider} />

              <p style={s.sectionLabel}>Reason Codes</p>
              <div style={s.tagRow}>
                {result.reason_codes.map((code) => (
                  <span key={code} style={s.tag}>{code.replace(/_/g, " ")}</span>
                ))}
              </div>

              <div style={s.divider} />

              <p style={s.sectionLabel}>Request Details</p>
              <div style={s.metaGrid}>
                <MetaItem label="Request ID" value={result.request_id.slice(0, 18) + "…"} />
                <MetaItem label="Timestamp" value={new Date(result.timestamp).toLocaleString()} />
              </div>
            </>
          )}
        </section>
      </main>

      {/* History */}
      <div style={s.historyWrapper}>
        <RecentScores records={history} />
      </div>

      <footer style={s.footer}>
        Arbix AI Solutions · SaakhSetu · Farmer Credit Scorer
      </footer>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────────
function FormField({ label, hint, children }) {
  return (
    <div style={s.field}>
      <div style={s.labelRow}>
        <label style={s.label}>{label}</label>
        <span style={s.hint}>{hint}</span>
      </div>
      {children}
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div>
      <p style={s.metaLabel}>{label}</p>
      <p style={s.metaValue}>{value}</p>
    </div>
  );
}

function Spinner() {
  return (
    <span style={s.spinner} />
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: "100vh",
    background: "#f1f5f9",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
    color: "#fff",
    padding: "1rem 2rem",
  },
  headerInner: {
    maxWidth: 1100,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "0.75rem",
  },
  headerTitle: { margin: 0, fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.5px" },
  headerSub: { margin: "2px 0 0", fontSize: "0.82rem", opacity: 0.75 },
  main: {
    maxWidth: 1100,
    margin: "2rem auto",
    padding: "0 1.25rem",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "1.5rem",
    width: "100%",
    boxSizing: "border-box",
  },
  card: {
    background: "#fff",
    borderRadius: 14,
    boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
    padding: "1.75rem",
  },
  resultPanel: { display: "flex", flexDirection: "column" },
  sectionLabel: { margin: "0 0 0.85rem", fontSize: "0.78rem", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" },
  form: { display: "flex", flexDirection: "column", gap: "1rem" },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  labelRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  label: { fontWeight: 600, fontSize: "0.875rem", color: "#1e293b" },
  hint: { fontSize: "0.75rem", color: "#94a3b8" },
  input: {
    padding: "0.55rem 0.85rem",
    borderRadius: 8,
    border: "1.5px solid #e2e8f0",
    fontSize: "0.95rem",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
    background: "#f8fafc",
  },
  sliderRow: { display: "flex", gap: 8, alignItems: "center" },
  repBadge: {
    padding: "3px 10px", borderRadius: 20, fontSize: "0.78rem",
    fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
  },
  btn: {
    marginTop: "0.25rem",
    padding: "0.7rem",
    background: "linear-gradient(135deg, #1e3a5f, #2563eb)",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.01em",
  },
  btnDisabled: { opacity: 0.65, cursor: "not-allowed" },
  spinnerRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  spinner: {
    display: "inline-block",
    width: 14, height: 14,
    border: "2px solid rgba(255,255,255,0.35)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
  errorBox: {
    marginTop: "1rem",
    background: "#fef2f2",
    border: "1.5px solid #fca5a5",
    borderRadius: 9,
    padding: "0.85rem 1rem",
    display: "flex",
    gap: "0.75rem",
    alignItems: "flex-start",
  },
  errorIcon: { color: "#dc2626", fontWeight: 700, flexShrink: 0 },
  errorTitle: { margin: "0 0 4px", fontWeight: 700, color: "#b91c1c", fontSize: "0.9rem" },
  errorPre: { margin: 0, fontSize: "0.8rem", color: "#b91c1c", whiteSpace: "pre-wrap" },
  emptyState: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: "1rem",
    padding: "2rem", opacity: 0.5,
  },
  emptyIcon: { fontSize: "3rem" },
  emptyText: { textAlign: "center", color: "#64748b", fontSize: "0.9rem", maxWidth: 220 },
  gaugeRow: { display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "1rem" },
  scoreDetails: {},
  scoreHeading: { margin: "0 0 4px", fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" },
  scoreSubtext: { margin: 0, color: "#64748b", fontSize: "0.9rem" },
  divider: { height: 1, background: "#f1f5f9", margin: "1rem 0" },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "0.5rem" },
  tag: {
    background: "#eff6ff", color: "#1d4ed8",
    borderRadius: 20, padding: "4px 14px",
    fontSize: "0.82rem", fontWeight: 600,
    border: "1px solid #bfdbfe",
    textTransform: "capitalize",
  },
  metaGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" },
  metaLabel: { margin: "0 0 2px", fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" },
  metaValue: { margin: 0, fontSize: "0.82rem", color: "#334155", fontWeight: 500, wordBreak: "break-all" },
  driftBadge: {
    display: "flex", alignItems: "center", gap: 7,
    padding: "6px 14px", borderRadius: 20, fontSize: "0.82rem",
  },
  driftDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  historyWrapper: { maxWidth: 1100, margin: "0 auto 1.5rem", padding: "0 1.25rem", width: "100%", boxSizing: "border-box" },
  historyCard: {
    background: "#fff",
    borderRadius: 14,
    boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
    padding: "1.5rem 1.75rem",
    overflowX: "auto",
  },
  historyTitle: { margin: "0 0 0.85rem", fontSize: "0.78rem", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" },
  th: { textAlign: "left", padding: "6px 12px", color: "#94a3b8", fontWeight: 600,
    fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em",
    borderBottom: "1px solid #f1f5f9" },
  tr: { borderBottom: "1px solid #f8fafc" },
  td: { padding: "8px 12px", color: "#334155" },
  smallTag: {
    background: "#f0fdf4", color: "#166534",
    borderRadius: 10, padding: "2px 8px", fontSize: "0.75rem", fontWeight: 600,
  },
  footer: {
    marginTop: "auto",
    textAlign: "center",
    padding: "1.25rem",
    fontSize: "0.78rem",
    color: "#94a3b8",
    borderTop: "1px solid #e2e8f0",
    background: "#fff",
  },
};

// Inject keyframes for spinner
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
