"use client";

import { useState } from "react";

interface ConvoMessage {
  agentId: string;
  agentName: string;
  content: string;
  timestamp: number;
}

interface ConvoData {
  id: string;
  participants: string[];
  messages: ConvoMessage[];
  location: string;
  startTime?: number;
  endTime?: number;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export default function ConvoStream({
  conversations,
  history,
}: {
  conversations: ConvoData[];
  history: ConvoData[];
}) {
  const [tab, setTab] = useState<"live" | "history">("live");
  const pastConvos = history.filter((c) => c.endTime);

  return (
    <div style={{ borderTop: "1px solid #1e293b", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1e293b" }}>
        <button
          onClick={() => setTab("live")}
          style={{
            flex: 1, padding: "8px 0", fontSize: 12, border: "none",
            background: tab === "live" ? "#1e293b" : "transparent",
            color: tab === "live" ? "#f472b6" : "#64748b",
            cursor: "pointer", borderBottom: tab === "live" ? "2px solid #f472b6" : "2px solid transparent",
          }}
        >
          Live ({conversations.length})
        </button>
        <button
          onClick={() => setTab("history")}
          style={{
            flex: 1, padding: "8px 0", fontSize: 12, border: "none",
            background: tab === "history" ? "#1e293b" : "transparent",
            color: tab === "history" ? "#c084fc" : "#64748b",
            cursor: "pointer", borderBottom: tab === "history" ? "2px solid #c084fc" : "2px solid transparent",
          }}
        >
          History ({pastConvos.length})
        </button>
      </div>

      <div style={{ overflow: "auto", flex: 1, padding: 10 }}>
        {tab === "live" && (
          conversations.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 12, padding: 8 }}>
              No active conversations...
            </div>
          ) : (
            conversations.map((convo) => (
              <ConvoCard key={convo.id} convo={convo} live />
            ))
          )
        )}

        {tab === "history" && (
          pastConvos.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 12, padding: 8 }}>
              No conversation history yet...
            </div>
          ) : (
            pastConvos.slice().reverse().map((convo) => (
              <ConvoCard key={convo.id} convo={convo} />
            ))
          )
        )}
      </div>
    </div>
  );
}

function ConvoCard({ convo, live }: { convo: ConvoData; live?: boolean }) {
  const [expanded, setExpanded] = useState(live || false);

  return (
    <div
      style={{
        marginBottom: 8, padding: 8, background: "#1e293b", borderRadius: 6,
        borderLeft: `3px solid ${live ? "#f472b6" : "#475569"}`,
        cursor: "pointer",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: live ? "#f472b6" : "#94a3b8" }}>
          {live && "🔴 "}{convo.location}
          {convo.startTime && ` | ${formatTime(convo.startTime)}`}
          {convo.endTime && ` - ${formatTime(convo.endTime)}`}
        </div>
        <div style={{ fontSize: 10, color: "#475569" }}>
          {convo.messages.length} msgs {expanded ? "▾" : "▸"}
        </div>
      </div>
      {expanded && convo.messages.map((msg, i) => (
        <div key={i} style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
          <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{msg.agentName.split(" ")[0]}: </span>
          <span style={{ color: "#cbd5e1" }}>{msg.content}</span>
        </div>
      ))}
      {!expanded && convo.messages.length > 0 && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          {convo.messages[0].agentName.split(" ")[0]}: {convo.messages[0].content.slice(0, 60)}...
        </div>
      )}
    </div>
  );
}
