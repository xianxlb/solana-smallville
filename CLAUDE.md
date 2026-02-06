# Solana Smallville

Generative agents simulation inspired by Stanford's Smallville paper, populated with AI agents mimicking real Solana ecosystem personalities.

## Architecture

Three-layer agent cognition:
1. **Memory Stream** — `src/agents/memory-stream.ts` — Chronological log with importance scoring, retrieval via recency + importance + relevance
2. **Planning + Reflection** — `src/agents/planning.ts`, `src/agents/reflection.ts` — Daily plans decomposed into hourly blocks; reflections triggered when accumulated importance exceeds threshold
3. **Perception + Reaction** — `src/agents/perception.ts`, `src/agents/reaction.ts` — Observe nearby agents, decide whether to converse or continue

## Tech Stack
- **Frontend**: Next.js + Canvas 2D (no Phaser yet)
- **Agent Runtime**: TypeScript — simulation loop in `src/world/simulation.ts`
- **LLM**: Claude API (Sonnet 4.5 for speed)
- **Blockchain**: @solana/web3.js — log encounters on devnet
- **Real-time**: WebSocket streaming from Express server
- **Server**: `src/server/index.ts` — Express + WS

## Commands
- `npm run dev` — Next.js frontend (port 3000)
- `npm run server` — Agent simulation server (port 3001)
- `npm run build` — Build frontend

## Key Files
- `src/agents/types.ts` — Core types (Agent, Memory, Plan, Conversation)
- `src/agents/personality-seeds.ts` — 8 Solana personality seeds
- `src/world/simulation.ts` — Main tick loop
- `src/world/locations.ts` — 10 named locations in the world
- `src/solana/logger.ts` — On-chain event logging
- `src/app/page.tsx` — World viewer with canvas

## Colosseum Hackathon
- Agent ID: 749
- API Key stored in `~/.claude/projects/-Users-xian/secrets/colosseum.env`
- Forum post ID: 1721
- Deadline: Feb 12, 2026 12:00 PM EST
