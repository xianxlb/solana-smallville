"use client";

import { useState, useEffect } from "react";

interface AgentData {
  id: string;
  name: string;
  status: string;
  currentLocation: string;
  currentAction: string | null;
  memoryCount: number;
  recentMemories: { description: string; type: string; importance: number }[];
}

interface DetailedAgent {
  id: string;
  name: string;
  description: string;
  status: string;
  currentLocation: string;
  currentPlan: {
    overview: string;
    hourlyBlocks: { description: string; startTime: number; duration: number; location: string; status: string }[];
  } | null;
  memoryStream: { description: string; type: string; importance: number; timestamp: number }[];
}

const TYPE_COLORS: Record<string, string> = {
  observation: "#60a5fa",
  conversation: "#f472b6",
  reflection: "#c084fc",
  plan: "#fbbf24",
};

export default function AgentPanel({ agent, apiUrl }: { agent: AgentData; apiUrl: string }) {
  const [detailed, setDetailed] = useState<DetailedAgent | null>(null);
  const [tab, setTab] = useState<"memories" | "plan">("memories");

  useEffect(() => {
    fetch(`${apiUrl}/api/agent/${agent.id}`)
      .then((r) => r.json())
      .then(setDetailed)
      .catch(console.error);
  }, [agent.id, apiUrl]);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>{agent.name}</h2>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
        {agent.status} at {agent.currentLocation}
      </div>
      {agent.currentAction && (
        <div style={{ fontSize: 13, color: "#fbbf24", marginBottom: 12 }}>
          Currently: {agent.currentAction}
        </div>
      )}

      {detailed && (
        <>
          <p style={{ fontSize: 12, color: "#666", lineHeight: 1.4, marginBottom: 12 }}>
            {detailed.description.slice(0, 200)}...
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => setTab("memories")}
              style={{
                padding: "4px 12px",
                fontSize: 12,
                border: "1px solid #444",
                borderRadius: 4,
                background: tab === "memories" ? "#334155" : "transparent",
                color: "#eee",
                cursor: "pointer",
              }}
            >
              Memories ({detailed.memoryStream.length})
            </button>
            <button
              onClick={() => setTab("plan")}
              style={{
                padding: "4px 12px",
                fontSize: 12,
                border: "1px solid #444",
                borderRadius: 4,
                background: tab === "plan" ? "#334155" : "transparent",
                color: "#eee",
                cursor: "pointer",
              }}
            >
              Plan
            </button>
          </div>

          {tab === "memories" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {detailed.memoryStream
                .slice()
                .reverse()
                .map((m, i) => (
                  <div key={i} style={{ fontSize: 12, padding: "6px 8px", background: "#1e293b", borderRadius: 4, borderLeft: `3px solid ${TYPE_COLORS[m.type] || "#666"}` }}>
                    <div style={{ color: "#94a3b8", fontSize: 10, marginBottom: 2 }}>
                      {m.type} | importance: {m.importance}/10
                    </div>
                    {m.description}
                  </div>
                ))}
            </div>
          )}

          {tab === "plan" && detailed.currentPlan && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>
                {detailed.currentPlan.overview}
              </div>
              {detailed.currentPlan.hourlyBlocks.map((block, i) => {
                const h = Math.floor(block.startTime / 60);
                const m = block.startTime % 60;
                const timeStr = `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
                return (
                  <div
                    key={i}
                    style={{
                      fontSize: 12,
                      padding: "6px 8px",
                      background: block.status === "active" ? "#1e3a2e" : "#1e293b",
                      borderRadius: 4,
                      borderLeft: `3px solid ${block.status === "active" ? "#4ade80" : block.status === "completed" ? "#666" : "#fbbf24"}`,
                      opacity: block.status === "completed" ? 0.5 : 1,
                    }}
                  >
                    <div style={{ color: "#94a3b8", fontSize: 10 }}>
                      {timeStr} ({block.duration}min) @ {block.location}
                    </div>
                    {block.description}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
