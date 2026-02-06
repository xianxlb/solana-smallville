import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { Simulation } from "@/world/simulation";

const PORT = parseInt(process.env.PORT || "3001");

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const simulation = new Simulation();

// Broadcast simulation events to all connected WebSocket clients
simulation.onEvent((event) => {
  const message = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
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
  simulation.start(2000); // tick every 2 seconds
});
