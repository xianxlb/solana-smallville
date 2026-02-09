import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // Local dev; Railway injects env vars directly
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { Simulation } from "@/world/simulation";
import { initSolanaLogger, isLoggerEnabled, getEventLog } from "@/solana/logger";
import { PriceTracker } from "@/solana/pyth-price";

// Initialize Solana logger via AgentWallet API
initSolanaLogger();

const PORT = parseInt(process.env.PORT || "3001");

const app = express();
app.use(express.json());

// CORS for deployed frontend
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const priceTracker = new PriceTracker();
const simulation = new Simulation(priceTracker);

// Broadcast simulation events to all connected WebSocket clients
simulation.onEvent((event) => {
  const message = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
});

// Periodic world snapshot broadcast (every 3 ticks)
let tickCount = 0;
simulation.onEvent(() => {
  tickCount++;
  if (tickCount % 3 === 0) {
    const snapshot = JSON.stringify({
      type: "world_snapshot",
      data: simulation.getWorldSnapshot(),
      timestamp: simulation.world.currentTime,
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(snapshot);
      }
    });
  }
});

// REST endpoints
app.get("/api/world", (_req, res) => {
  res.json(simulation.getWorldSnapshot());
});

app.get("/api/agent/:id", (req, res) => {
  const agent = simulation.world.agents.get(req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  res.json({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    position: agent.position,
    status: agent.status,
    currentLocation: agent.currentLocation,
    currentPlan: agent.currentPlan,
    memoryStream: agent.memoryStream.slice(-30).map((m) => ({
      description: m.description,
      type: m.type,
      importance: m.importance,
      timestamp: m.timestamp,
    })),
    conversationId: agent.currentConversation?.id || null,
  });
});

app.get("/api/conversations", (_req, res) => {
  const active = simulation.world.conversations
    .filter((c) => !c.endTime)
    .map((c) => ({
      id: c.id,
      participants: c.participants,
      messages: c.messages,
      location: c.location,
      startTime: c.startTime,
    }));
  res.json(active);
});

app.get("/api/conversations/all", (_req, res) => {
  const recent = simulation.world.conversations.slice(-20).map((c) => ({
    id: c.id,
    participants: c.participants,
    messages: c.messages,
    location: c.location,
    startTime: c.startTime,
    endTime: c.endTime,
  }));
  res.json(recent);
});

// Simulation control
app.post("/api/sim/pause", (_req, res) => {
  simulation.pause();
  res.json({ paused: true });
});

app.post("/api/sim/resume", (_req, res) => {
  simulation.resume();
  res.json({ paused: false });
});

app.post("/api/sim/speed", (req, res) => {
  const speed = parseInt(req.body.speed);
  if (isNaN(speed) || speed < 1 || speed > 10) return res.status(400).json({ error: "Speed must be 1-10" });
  simulation.setSpeed(speed);
  res.json({ speed: simulation.getSpeed() });
});

app.get("/api/sim/status", (_req, res) => {
  res.json({ paused: simulation.isPaused(), speed: simulation.getSpeed() });
});

app.get("/api/solana/status", (_req, res) => {
  res.json({ enabled: isLoggerEnabled(), eventCount: getEventLog().length });
});

app.get("/api/solana/events", (_req, res) => {
  res.json(getEventLog().slice(-50));
});

app.get("/api/metrics", (_req, res) => {
  const agents = Array.from(simulation.world.agents.values());
  const totalMemories = agents.reduce((s, a) => s + a.memoryStream.length, 0);
  const agentStatuses: Record<string, number> = {};
  for (const a of agents) {
    agentStatuses[a.status] = (agentStatuses[a.status] || 0) + 1;
  }
  res.json({
    totalConversations: simulation.world.conversations.length,
    activeConversations: simulation.world.conversations.filter((c) => !c.endTime).length,
    onChainTxs: getEventLog().filter((e) => e.txHash).length,
    totalMemories,
    avgMemoriesPerAgent: agents.length > 0 ? totalMemories / agents.length : 0,
    agentStatuses,
    solPrice: priceTracker.currentPrice,
    solChange: priceTracker.priceChange,
  });
});

app.get("/api/solana/price", (_req, res) => {
  res.json(priceTracker.getSnapshot());
});

// WebSocket connection
wss.on("connection", (ws) => {
  console.log("Client connected");
  // Send initial state
  ws.send(JSON.stringify({ type: "world_snapshot", data: simulation.getWorldSnapshot(), timestamp: simulation.world.currentTime }));

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket at ws://localhost:${PORT}/ws`);
  const tickMs = parseInt(process.env.TICK_INTERVAL_MS || "2000");
  simulation.start(tickMs);
});
