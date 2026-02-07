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
  description: string;
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
  startTime?: number;
  endTime?: number;
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

const LOCATION_ICONS: Record<string, string> = {
  "Solana HQ": "🏢",
  "DRiP Gallery": "🎨",
  "The Colosseum": "🏟️",
  "Helius Labs": "🔬",
  "Dev Hub": "💻",
  "Learning Center": "📚",
  "Town Square": "⛲",
  "Press Room": "📰",
  "Validators' Café": "☕",
  "Consensus Park": "🌳",
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
  const [convoHistory, setConvoHistory] = useState<ConvoData[]>([]);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tickRef = useRef(0);

  // Connect WebSocket
  useEffect(() => {
    let ws: WebSocket;
    function connect() {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "world_snapshot") {
          setWorld(data.data);
          setConversations(data.data.activeConversations || []);
        } else if (
          data.type === "conversation_start" ||
          data.type === "conversation_message" ||
          data.type === "conversation_end"
        ) {
          // Refresh world state and conversation history
          fetch(`${API_URL}/api/world`)
            .then((r) => r.json())
            .then((w) => {
              setWorld(w);
              setConversations(w.activeConversations || []);
            });
          fetch(`${API_URL}/api/conversations/all`)
            .then((r) => r.json())
            .then(setConvoHistory);
        }
      };

      ws.onclose = () => {
        setTimeout(connect, 3000);
      };
    }

    connect();

    // Initial fetch
    fetch(`${API_URL}/api/world`)
      .then((r) => r.json())
      .then((w) => {
        setWorld(w);
        setConversations(w.activeConversations || []);
      })
      .catch(console.error);
    fetch(`${API_URL}/api/conversations/all`)
      .then((r) => r.json())
      .then(setConvoHistory)
      .catch(console.error);
    fetch(`${API_URL}/api/sim/status`)
      .then((r) => r.json())
      .then((s) => { setPaused(s.paused); setSpeed(s.speed); })
      .catch(console.error);

    return () => ws?.close();
  }, []);

  // Draw world on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    tickRef.current++;

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 800, 600);

    // Grid pattern (subtle)
    ctx.strokeStyle = "#1e293b40";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < 800; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 600); ctx.stroke();
    }
    for (let y = 0; y < 600; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke();
    }

    // Draw locations
    for (const loc of world.locations) {
      const isOutdoor = loc.type !== "building";

      // Location fill with rounded corners
      ctx.beginPath();
      const r = 6;
      ctx.moveTo(loc.x + r, loc.y);
      ctx.lineTo(loc.x + loc.width - r, loc.y);
      ctx.quadraticCurveTo(loc.x + loc.width, loc.y, loc.x + loc.width, loc.y + r);
      ctx.lineTo(loc.x + loc.width, loc.y + loc.height - r);
      ctx.quadraticCurveTo(loc.x + loc.width, loc.y + loc.height, loc.x + loc.width - r, loc.y + loc.height);
      ctx.lineTo(loc.x + r, loc.y + loc.height);
      ctx.quadraticCurveTo(loc.x, loc.y + loc.height, loc.x, loc.y + loc.height - r);
      ctx.lineTo(loc.x, loc.y + r);
      ctx.quadraticCurveTo(loc.x, loc.y, loc.x + r, loc.y);
      ctx.closePath();

      ctx.fillStyle = isOutdoor ? "#0d2818" : "#172554";
      ctx.fill();
      ctx.strokeStyle = isOutdoor ? "#16a34a30" : "#3b82f630";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Icon + Name
      const icon = LOCATION_ICONS[loc.name] || "📍";
      const cx = loc.x + loc.width / 2;
      const cy = loc.y + loc.height / 2;

      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(icon, cx, cy - 4);

      ctx.fillStyle = "#64748b";
      ctx.font = "9px system-ui";
      ctx.fillText(loc.name, cx, cy + 12);
    }

    // Draw conversation lines first (behind agents)
    for (const convo of conversations) {
      if (convo.participants.length >= 2) {
        const a1 = world.agents[convo.participants[0]];
        const a2 = world.agents[convo.participants[1]];
        if (a1 && a2) {
          // Animated dashed line
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.lineDashOffset = -(tickRef.current % 16);
          ctx.moveTo(a1.position.x, a1.position.y);
          ctx.lineTo(a2.position.x, a2.position.y);
          ctx.strokeStyle = "#f472b660";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);

          // Speech bubble at midpoint
          const mx = (a1.position.x + a2.position.x) / 2;
          const my = (a1.position.y + a2.position.y) / 2 - 16;
          ctx.font = "12px system-ui";
          ctx.fillText("💬", mx, my);
        }
      }
    }

    // Draw agents
    for (const [id, agent] of Object.entries(world.agents)) {
      const isSelected = id === selectedAgent;
      const isTalking = agent.status === "talking";
      const color = STATUS_COLORS[agent.status] || "#4ade80";
      const { x, y } = agent.position;

      // Glow effect for selected or talking agents
      if (isSelected || isTalking) {
        const glowRadius = isSelected ? 20 : 16;
        const pulse = isTalking ? 0.3 + 0.2 * Math.sin(tickRef.current * 0.15) : 0.3;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
        grad.addColorStop(0, color + Math.round(pulse * 255).toString(16).padStart(2, "0"));
        grad.addColorStop(1, color + "00");
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Agent circle with border
      const radius = isSelected ? 8 : 6;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#ffffff" : color + "80";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Initial letter inside circle
      ctx.fillStyle = "#000";
      ctx.font = `bold ${isSelected ? 10 : 8}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(agent.name[0], x, y + 0.5);
      ctx.textBaseline = "alphabetic";

      // Name label with shadow
      ctx.fillStyle = "#00000080";
      ctx.font = isSelected ? "bold 11px system-ui" : "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(agent.name.split(" ")[0], x + 1, y - 13);
      ctx.fillStyle = isSelected ? "#ffffff" : "#e2e8f0";
      ctx.fillText(agent.name.split(" ")[0], x, y - 14);

      // Current action tooltip for selected agent
      if (isSelected && agent.currentAction) {
        const text = agent.currentAction.slice(0, 50) + (agent.currentAction.length > 50 ? "..." : "");
        const tw = ctx.measureText(text).width + 12;
        const tx = Math.max(tw / 2, Math.min(800 - tw / 2, x));
        ctx.fillStyle = "#1e293bdd";
        ctx.beginPath();
        ctx.roundRect(tx - tw / 2, y + 14, tw, 18, 4);
        ctx.fill();
        ctx.fillStyle = "#fbbf24";
        ctx.font = "9px system-ui";
        ctx.fillText(text, tx, y + 26);
      }
    }

    // Paused overlay
    if (paused) {
      ctx.fillStyle = "#00000060";
      ctx.fillRect(0, 0, 800, 600);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 24px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("⏸ PAUSED", 400, 300);
    }
  }, [world, selectedAgent, conversations, paused]);

  useEffect(() => {
    draw();
    const interval = setInterval(draw, 80); // ~12fps for smooth animations
    return () => clearInterval(interval);
  }, [draw]);

  // Handle click on canvas to select agent
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!world) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 600 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

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

  const togglePause = async () => {
    const endpoint = paused ? "resume" : "pause";
    await fetch(`${API_URL}/api/sim/${endpoint}`, { method: "POST" });
    setPaused(!paused);
  };

  const changeSpeed = async (newSpeed: number) => {
    await fetch(`${API_URL}/api/sim/speed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed: newSpeed }),
    });
    setSpeed(newSpeed);
  };

  const selectedAgentData = selectedAgent && world ? world.agents[selectedAgent] : null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0a" }}>
      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 18, color: "#e2e8f0" }}>Solana Smallville</h1>
            {world && (
              <span style={{ fontSize: 13, color: "#64748b" }}>
                Day {world.currentDay} | {formatTime(world.currentTime)} | {Object.keys(world.agents).length} agents
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={togglePause}
              style={{ padding: "4px 12px", fontSize: 12, border: "1px solid #334155", borderRadius: 4, background: paused ? "#991b1b" : "#1e293b", color: "#e2e8f0", cursor: "pointer" }}
            >
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <span style={{ fontSize: 11, color: "#64748b" }}>Speed:</span>
            {[1, 2, 5, 10].map((s) => (
              <button
                key={s}
                onClick={() => changeSpeed(s)}
                style={{
                  padding: "3px 8px", fontSize: 11, border: "1px solid #334155", borderRadius: 3,
                  background: speed === s ? "#334155" : "transparent", color: speed === s ? "#e2e8f0" : "#64748b",
                  cursor: "pointer",
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: 12 }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onClick={handleCanvasClick}
            style={{ border: "1px solid #1e293b", borderRadius: 8, cursor: "pointer", maxWidth: "100%", maxHeight: "100%" }}
          />
        </div>

        {/* Legend */}
        <div style={{ padding: "6px 16px", borderTop: "1px solid #1e293b", display: "flex", gap: 16, fontSize: 11 }}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 4, color: "#64748b" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color }} />
              {status}
            </div>
          ))}
          <div style={{ marginLeft: "auto", color: "#475569", fontSize: 10 }}>
            Click an agent to inspect
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: 380, borderLeft: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selectedAgentData ? (
          <AgentPanel agent={selectedAgentData} apiUrl={API_URL} />
        ) : (
          <div style={{ padding: 16, color: "#475569", fontSize: 13 }}>
            Select an agent to view details
          </div>
        )}
        <ConvoStream conversations={conversations} history={convoHistory} />
      </div>
    </div>
  );
}
