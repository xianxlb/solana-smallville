"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AgentPanel from "./components/AgentPanel";
import ConvoStream from "./components/ConvoStream";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface AgentData {
  id: string;
  name: string;
  position: { x: number; y: number };
  status: string;
  currentLocation: string;
  currentAction: string | null;
  conversationId: string | null;
  memoryCount: number;
  recentMemories: { description: string; type: string; importance: number }[];
}

interface LocationData {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
}

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

interface WorldSnapshot {
  currentTime: number;
  currentDay: number;
  agents: Record<string, AgentData>;
  activeConversations: ConvoData[];
  locations: LocationData[];
}

const STATUS_COLORS: Record<string, string> = {
  idle: "#4ade80",
  walking: "#60a5fa",
  talking: "#f472b6",
  reflecting: "#c084fc",
  planning: "#fbbf24",
};

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export default function Home() {
  const [world, setWorld] = useState<WorldSnapshot | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConvoData[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect WebSocket
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "world_snapshot") {
        setWorld(data.data);
        setConversations(data.data.activeConversations || []);
      } else if (data.type === "conversation_start" || data.type === "conversation_message") {
        // Refresh world state
        fetch(`${API_URL}/api/world`)
          .then((r) => r.json())
          .then((w) => {
            setWorld(w);
            setConversations(w.activeConversations || []);
          });
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected, retrying in 3s...");
      setTimeout(() => {
        wsRef.current = new WebSocket(WS_URL);
      }, 3000);
    };

    // Initial fetch
    fetch(`${API_URL}/api/world`)
      .then((r) => r.json())
      .then((w) => {
        setWorld(w);
        setConversations(w.activeConversations || []);
      })
      .catch(console.error);

    return () => ws.close();
  }, []);

  // Draw world on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, 800, 600);

    // Draw locations
    for (const loc of world.locations) {
      ctx.fillStyle = loc.type === "building" ? "#16213e" : "#1a3a1a";
      ctx.fillRect(loc.x, loc.y, loc.width, loc.height);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1;
      ctx.strokeRect(loc.x, loc.y, loc.width, loc.height);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(loc.name, loc.x + loc.width / 2, loc.y + loc.height / 2);
    }

    // Draw agents
    for (const [id, agent] of Object.entries(world.agents)) {
      const isSelected = id === selectedAgent;
      const color = STATUS_COLORS[agent.status] || "#4ade80";

      // Agent dot
      ctx.beginPath();
      ctx.arc(agent.position.x, agent.position.y, isSelected ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Name label
      ctx.fillStyle = "#fff";
      ctx.font = isSelected ? "bold 11px system-ui" : "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(agent.name.split(" ")[0], agent.position.x, agent.position.y - 12);

      // Draw conversation lines
      if (agent.conversationId) {
        const convo = conversations.find((c) => c.id === agent.conversationId);
        if (convo) {
          const otherId = convo.participants.find((p) => p !== id);
          const other = otherId ? world.agents[otherId] : null;
          if (other) {
            ctx.beginPath();
            ctx.moveTo(agent.position.x, agent.position.y);
            ctx.lineTo(other.position.x, other.position.y);
            ctx.strokeStyle = "#f472b680";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
    }
  }, [world, selectedAgent, conversations]);

  useEffect(() => {
    draw();
    const interval = setInterval(draw, 100);
    return () => clearInterval(interval);
  }, [draw]);

  // Handle click on canvas to select agent
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!world) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const [id, agent] of Object.entries(world.agents)) {
      const dx = x - agent.position.x;
      const dy = y - agent.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < 15) {
        setSelectedAgent(id);
        return;
      }
    }
    setSelectedAgent(null);
  };

  const selectedAgentData = selectedAgent && world ? world.agents[selectedAgent] : null;

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Solana Smallville</h1>
          {world && (
            <div style={{ fontSize: 14, color: "#94a3b8" }}>
              Day {world.currentDay} | {formatTime(world.currentTime)} |{" "}
              {Object.keys(world.agents).length} agents
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onClick={handleCanvasClick}
            style={{ border: "1px solid #333", borderRadius: 8, cursor: "pointer" }}
          />
        </div>
        <div style={{ padding: "8px 16px", borderTop: "1px solid #333", display: "flex", gap: 16, fontSize: 12 }}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color }} />
              {status}
            </div>
          ))}
        </div>
      </div>

      <div style={{ width: 360, borderLeft: "1px solid #333", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selectedAgentData ? (
          <AgentPanel agent={selectedAgentData} apiUrl={API_URL} />
        ) : (
          <div style={{ padding: 16, color: "#666" }}>Click an agent to view details</div>
        )}
        <ConvoStream conversations={conversations} />
      </div>
    </div>
  );
}
