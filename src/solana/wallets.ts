import { Keypair } from "@solana/web3.js";

// Agent wallets — for MVP, generate in-memory keypairs
// In production, integrate with AgentWallet MCP
const agentWallets = new Map<string, Keypair>();

export function getOrCreateWallet(agentId: string): Keypair {
  let wallet = agentWallets.get(agentId);
  if (!wallet) {
    wallet = Keypair.generate();
    agentWallets.set(agentId, wallet);
  }
  return wallet;
}

export function getWalletAddress(agentId: string): string {
  return getOrCreateWallet(agentId).publicKey.toBase58();
}

export function getAllWallets(): Map<string, string> {
  const result = new Map<string, string>();
  for (const [id, kp] of agentWallets) {
    result.set(id, kp.publicKey.toBase58());
  }
  return result;
}
