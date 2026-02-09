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
    <div style={{ borderTop: "1px solid #c8b080", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #c8b080" }}>
        <button
          onClick={() => setTab("live")}
          style={{
            flex: 1, padding: "6px 0", fontSize: 11, border: "none",
            background: tab === "live" ? "#ede4d0" : "#f5edd8",
            color: tab === "live" ? "#c84878" : "#8a7858",
            cursor: "pointer",
            borderBottom: tab === "live" ? "2px solid #c84878" : "2px solid transparent",
            fontFamily: "monospace",
          }}
        >
          Live ({conversations.length})
        </button>
        <button
          onClick={() => setTab("history")}
          style={{
            flex: 1, padding: "6px 0", fontSize: 11, border: "none",
            background: tab === "history" ? "#ede4d0" : "#f5edd8",
            color: tab === "history" ? "#8848a8" : "#8a7858",
            cursor: "pointer",
            borderBottom: tab === "history" ? "2px solid #8848a8" : "2px solid transparent",
            fontFamily: "monospace",
          }}
        >
          History ({pastConvos.length})
        </button>
      </div>

      <div style={{ overflow: "auto", flex: 1, padding: 8, background: "#f5edd8" }}>
        {tab === "live" && (
          conversations.length === 0 ? (
            <div style={{ color: "#a08858", fontSize: 11, padding: 6, fontFamily: "monospace" }}>
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
            <div style={{ color: "#a08858", fontSize: 11, padding: 6, fontFamily: "monospace" }}>
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
        marginBottom: 6, padding: 6,
        background: "#ede4d0",
        border: "1px solid #c8b080",
        borderLeft: `3px solid ${live ? "#c84878" : "#a08858"}`,
        cursor: "pointer",
        fontFamily: "monospace",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: live ? "#c84878" : "#6a5838" }}>
          {live && "* "}{convo.location}
          {convo.startTime && ` | ${formatTime(convo.startTime)}`}
          {convo.endTime && ` - ${formatTime(convo.endTime)}`}
        </div>
        <div style={{ fontSize: 10, color: "#a08858" }}>
          {convo.messages.length} msgs {expanded ? "-" : "+"}
        </div>
      </div>
      {expanded && convo.messages.map((msg, i) => (
        <div key={i} style={{ fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>
          <span style={{ fontWeight: 600, color: "#3a2818" }}>{msg.agentName.split(" ")[0]}: </span>
          <span style={{ color: "#5a4830" }}>{msg.content}</span>
        </div>
      ))}
      {!expanded && convo.messages.length > 0 && (
        <div style={{ fontSize: 10, color: "#6a5838", marginTop: 3 }}>
          {convo.messages[0].agentName.split(" ")[0]}: {convo.messages[0].content.slice(0, 60)}...
        </div>
      )}
    </div>
  );
}
