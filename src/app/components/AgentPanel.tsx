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
  observation: "#3868b8",
  conversation: "#c84878",
  reflection: "#8848a8",
  plan: "#b89828",
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
    <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
      <h2 style={{ margin: "0 0 2px", fontSize: 14, color: "#3a2818", fontFamily: "monospace" }}>{agent.name}</h2>
      <div style={{ fontSize: 11, color: "#8a7858", marginBottom: 6, fontFamily: "monospace" }}>
        {agent.status} at {agent.currentLocation}
      </div>
      {agent.currentAction && (
        <div style={{ fontSize: 11, color: "#b89828", marginBottom: 8, fontFamily: "monospace" }}>
          Currently: {agent.currentAction}
        </div>
      )}

      {detailed && (
        <>
          <p style={{ fontSize: 11, color: "#6a5838", lineHeight: 1.4, marginBottom: 8, fontFamily: "monospace" }}>
            {detailed.description.slice(0, 200)}...
          </p>

          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <button
              onClick={() => setTab("memories")}
              style={{
                padding: "3px 8px",
                fontSize: 10,
                border: "1px solid #c8b080",
                borderRadius: 0,
                background: tab === "memories" ? "#d8c8a8" : "#f5edd8",
                color: "#3a2818",
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              Memories ({detailed.memoryStream.length})
            </button>
            <button
              onClick={() => setTab("plan")}
              style={{
                padding: "3px 8px",
                fontSize: 10,
                border: "1px solid #c8b080",
                borderRadius: 0,
                background: tab === "plan" ? "#d8c8a8" : "#f5edd8",
                color: "#3a2818",
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              Plan
            </button>
          </div>

          {tab === "memories" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {detailed.memoryStream
                .slice()
                .reverse()
                .map((m, i) => (
                  <div key={i} style={{
                    fontSize: 11, padding: "4px 6px",
                    background: "#ede4d0", border: "1px solid #c8b080",
                    borderLeft: `3px solid ${TYPE_COLORS[m.type] || "#8a7858"}`,
                    fontFamily: "monospace",
                  }}>
                    <div style={{ color: "#8a7858", fontSize: 9, marginBottom: 1 }}>
                      {m.type} | imp: {m.importance}/10
                    </div>
                    <div style={{ color: "#3a2818" }}>{m.description}</div>
                  </div>
                ))}
            </div>
          )}

          {tab === "plan" && detailed.currentPlan && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, color: "#6a5838", marginBottom: 2, fontFamily: "monospace" }}>
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
                      fontSize: 11,
                      padding: "4px 6px",
                      background: block.status === "active" ? "#d8e8d0" : "#ede4d0",
                      border: "1px solid #c8b080",
                      borderLeft: `3px solid ${block.status === "active" ? "#2a8838" : block.status === "completed" ? "#8a7858" : "#b89828"}`,
                      opacity: block.status === "completed" ? 0.5 : 1,
                      fontFamily: "monospace",
                    }}
                  >
                    <div style={{ color: "#8a7858", fontSize: 9 }}>
                      {timeStr} ({block.duration}min) @ {block.location}
                    </div>
                    <div style={{ color: "#3a2818" }}>{block.description}</div>
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
