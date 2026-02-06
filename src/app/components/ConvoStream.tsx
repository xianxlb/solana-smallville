"use client";

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
}

export default function ConvoStream({ conversations }: { conversations: ConvoData[] }) {
  if (conversations.length === 0) {
    return (
      <div style={{ padding: 16, borderTop: "1px solid #333", color: "#666", fontSize: 12 }}>
        No active conversations...
      </div>
    );
  }

  return (
    <div style={{ borderTop: "1px solid #333", overflow: "auto", maxHeight: 300, padding: 12 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "#94a3b8" }}>
        Live Conversations ({conversations.length})
      </h3>
      {conversations.map((convo) => (
        <div key={convo.id} style={{ marginBottom: 12, padding: 8, background: "#1e293b", borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: "#f472b6", marginBottom: 4 }}>
            @ {convo.location}
          </div>
          {convo.messages.map((msg, i) => (
            <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{msg.agentName}: </span>
              <span style={{ color: "#cbd5e1" }}>{msg.content}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
