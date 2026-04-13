import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

const cardStyle: CSSProperties = {
  background: "rgba(255, 255, 255, 0.72)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 20,
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.06)",
  padding: 20,
  backdropFilter: "blur(16px)"
};

export interface SectionCardProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionCard({ title, subtitle, action, children }: SectionCardProps) {
  return (
    <section style={cardStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>{title}</h2>
          {subtitle ? (
            <p style={{ margin: "6px 0 0", color: "#475569", lineHeight: 1.5 }}>{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

