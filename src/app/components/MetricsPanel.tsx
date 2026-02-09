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
    <div style={{ borderBottom: "1px solid #c8b080" }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: "100%",
          padding: "6px 10px",
          background: "#ede4d0",
          border: "none",
          borderBottom: collapsed ? "none" : "1px solid #c8b080",
          color: "#5a4830",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "monospace",
        }}
      >
        <span>Simulation Metrics</span>
        <span style={{ fontSize: 9 }}>{collapsed ? "+" : "-"}</span>
      </button>
      {!collapsed && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
            padding: "6px 8px",
            background: "#f5edd8",
          }}
        >
          <StatCard label="Conversations" value={metrics.totalConversations} sub={`${metrics.activeConversations} active`} />
          <StatCard label="On-Chain Txs" value={metrics.onChainTxs} color="#2a8838" />
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
        background: "#ede4d0",
        border: "1px solid #c8b080",
        padding: "4px 6px",
      }}
    >
      <div style={{ fontSize: 9, color: "#8a7858", fontFamily: "monospace" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || "#3a2818", fontFamily: "monospace" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: "#8a7858", fontFamily: "monospace" }}>{sub}</div>}
    </div>
  );
}

function StatusCard({ statuses }: { statuses: Record<string, number> }) {
  const statusColors: Record<string, string> = {
    idle: "#2a8838",
    walking: "#3868b8",
    talking: "#c84878",
    reflecting: "#8848a8",
    planning: "#b89828",
  };

  return (
    <div
      style={{
        background: "#ede4d0",
        border: "1px solid #c8b080",
        padding: "4px 6px",
      }}
    >
      <div style={{ fontSize: 9, color: "#8a7858", fontFamily: "monospace", marginBottom: 2 }}>
        Agent Status
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {Object.entries(statuses).map(([status, count]) => (
          <span key={status} style={{ fontSize: 10, color: statusColors[status] || "#5a4830", fontFamily: "monospace" }}>
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
        background: "#ede4d0",
        border: "1px solid #c8b080",
        padding: "4px 6px",
      }}
    >
      <div style={{ fontSize: 9, color: "#8a7858", fontFamily: "monospace" }}>SOL Price</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: isUp ? "#2a8838" : "#c83030", fontFamily: "monospace" }}>
        ${price.toFixed(2)}
      </div>
      {change !== null && (
        <div style={{ fontSize: 9, color: isUp ? "#2a8838" : "#c83030", fontFamily: "monospace" }}>
          {isUp ? "+" : ""}{change.toFixed(2)}%
        </div>
      )}
    </div>
  );
}
