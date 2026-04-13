import type { CSSProperties } from "react";

const metricStyle: CSSProperties = {
  background:
    "linear-gradient(145deg, rgba(14, 165, 233, 0.08), rgba(34, 197, 94, 0.08) 70%, rgba(255,255,255,0.95))",
  border: "1px solid rgba(14, 165, 233, 0.12)",
  borderRadius: 18,
  padding: 18
};

export interface MetricCardProps {
  label: string;
  value: string;
  caption?: string;
}

export function MetricCard({ label, value, caption }: MetricCardProps) {
  return (
    <div style={metricStyle}>
      <p style={{ margin: 0, color: "#0f766e", fontWeight: 600 }}>{label}</p>
      <h3 style={{ margin: "12px 0 8px", fontSize: 34, color: "#0f172a" }}>{value}</h3>
      {caption ? <p style={{ margin: 0, color: "#475569" }}>{caption}</p> : null}
    </div>
  );
}

