import type { CSSProperties } from "react";

const palettes: Record<string, CSSProperties> = {
  running: {
    background: "rgba(14, 165, 233, 0.12)",
    color: "#0369a1"
  },
  waiting_approval: {
    background: "rgba(245, 158, 11, 0.15)",
    color: "#b45309"
  },
  completed: {
    background: "rgba(34, 197, 94, 0.12)",
    color: "#15803d"
  },
  approved: {
    background: "rgba(34, 197, 94, 0.12)",
    color: "#15803d"
  },
  accepted: {
    background: "rgba(34, 197, 94, 0.12)",
    color: "#15803d"
  },
  active: {
    background: "rgba(34, 197, 94, 0.12)",
    color: "#15803d"
  },
  approver: {
    background: "rgba(14, 165, 233, 0.12)",
    color: "#0369a1"
  },
  operator: {
    background: "rgba(168, 85, 247, 0.12)",
    color: "#7e22ce"
  },
  org_admin: {
    background: "rgba(251, 191, 36, 0.16)",
    color: "#92400e"
  },
  pending: {
    background: "rgba(245, 158, 11, 0.15)",
    color: "#b45309"
  },
  rejected: {
    background: "rgba(239, 68, 68, 0.12)",
    color: "#b91c1c"
  },
  queued: {
    background: "rgba(99, 102, 241, 0.12)",
    color: "#4338ca"
  },
  default: {
    background: "rgba(148, 163, 184, 0.14)",
    color: "#334155"
  }
};

export interface StatusBadgeProps {
  label: string;
}

export function StatusBadge({ label }: StatusBadgeProps) {
  const palette = palettes[label] ?? palettes.default;

  return (
    <span
      style={{
        ...palette,
        alignItems: "center",
        borderRadius: 999,
        display: "inline-flex",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "6px 10px",
        textTransform: "uppercase"
      }}
    >
      {label.replaceAll("_", " ")}
    </span>
  );
}
