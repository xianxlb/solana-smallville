"use client";

import { useState, useEffect } from "react";

interface MetricsData {
  totalConversations: number;
  activeConversations: number;
  onChainTxs: number;
  totalMemories: number;
  avgMemoriesPerAgent: number;
  agentStatuses: Record<string, number>;
  solPrice: number | null;
  solChange: number | null;
}

export default function MetricsPanel({ apiUrl }: { apiUrl: string }) {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const poll = () => {
      fetch(`${apiUrl}/api/metrics`)
        .then((r) => r.json())
        .then(setMetrics)
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [apiUrl]);

  if (!metrics) return null;

  return (
    <div style={{ borderBottom: "1px solid #2a2a2a" }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: "100%",
          padding: "8px 12px",
          background: "#111",
          border: "none",
          borderBottom: collapsed ? "none" : "1px solid #2a2a2a",
          color: "#94a3b8",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "sans-serif",
        }}
      >
        <span>Simulation Metrics</span>
        <span style={{ fontSize: 9 }}>{collapsed ? "▶" : "▼"}</span>
      </button>
      {!collapsed && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            padding: "8px 10px",
            background: "#111",
          }}
        >
          <StatCard label="Conversations" value={metrics.totalConversations} sub={`${metrics.activeConversations} active`} />
          <StatCard label="On-Chain Txs" value={metrics.onChainTxs} color="#40c890" />
          <StatCard label="Total Memories" value={metrics.totalMemories} />
          <StatCard label="Avg Memories" value={metrics.avgMemoriesPerAgent.toFixed(1)} />
          <StatusCard statuses={metrics.agentStatuses} />
          {metrics.solPrice !== null && (
            <SolPriceCard price={metrics.solPrice} change={metrics.solChange} />
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 4,
        padding: "6px 8px",
      }}
    >
      <div style={{ fontSize: 9, color: "#64748b", fontFamily: "sans-serif" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || "#e2e8f0", fontFamily: "sans-serif" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: "#64748b", fontFamily: "sans-serif" }}>{sub}</div>}
    </div>
  );
}

function StatusCard({ statuses }: { statuses: Record<string, number> }) {
  const statusColors: Record<string, string> = {
    idle: "#4ade80",
    walking: "#60a5fa",
    talking: "#f472b6",
    reflecting: "#c084fc",
    planning: "#fbbf24",
  };

  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 4,
        padding: "6px 8px",
      }}
    >
      <div style={{ fontSize: 9, color: "#64748b", fontFamily: "sans-serif", marginBottom: 3 }}>
        Agent Status
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(statuses).map(([status, count]) => (
          <span key={status} style={{ fontSize: 10, color: statusColors[status] || "#94a3b8", fontFamily: "sans-serif" }}>
            {count} {status}
          </span>
        ))}
      </div>
    </div>
  );
}

function SolPriceCard({ price, change }: { price: number; change: number | null }) {
  const isUp = change !== null && change >= 0;
  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 4,
        padding: "6px 8px",
      }}
    >
      <div style={{ fontSize: 9, color: "#64748b", fontFamily: "sans-serif" }}>SOL Price</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: isUp ? "#4ade80" : "#f87171", fontFamily: "sans-serif" }}>
        ${price.toFixed(2)}
      </div>
      {change !== null && (
        <div style={{ fontSize: 9, color: isUp ? "#4ade80" : "#f87171", fontFamily: "sans-serif" }}>
          {isUp ? "+" : ""}{change.toFixed(2)}%
        </div>
      )}
    </div>
  );
}
