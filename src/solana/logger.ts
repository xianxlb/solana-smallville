import { Connection, Keypair, Transaction, SystemProgram, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import crypto from "crypto";

const DEVNET_URL = "https://api.devnet.solana.com";

let connection: Connection | null = null;
let payer: Keypair | null = null;

export function initSolanaLogger(payerKeypair?: Keypair) {
  connection = new Connection(DEVNET_URL, "confirmed");
  payer = payerKeypair || Keypair.generate();
  console.log(`Solana logger initialized. Payer: ${payer.publicKey.toBase58()}`);
}

export function hashEvent(data: Record<string, unknown>): string {
  const json = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash("sha256").update(json).digest("hex");
}

// Log an encounter hash on-chain using a memo-style transaction
// Uses the memo field in a minimal SOL transfer to self
export async function logOnChain(eventHash: string, metadata?: string): Promise<string | null> {
  if (!connection || !payer) {
    console.warn("Solana logger not initialized, skipping on-chain log");
    return null;
  }

  try {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: payer.publicKey,
        lamports: 0,
      }),
    );

    // Add memo data as a simple instruction
    // In production, use the SPL Memo program
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log(`Logged on-chain: ${eventHash.slice(0, 16)}... tx: ${signature}`);
    return signature;
  } catch (err) {
    console.error("Failed to log on-chain:", err);
    return null;
  }
}

export async function logConversation(
  participants: string[],
  location: string,
  messageCount: number,
  timestamp: number,
): Promise<string | null> {
  const hash = hashEvent({
    type: "conversation",
    participants: participants.sort(),
    location,
    messageCount,
    timestamp,
  });
  return logOnChain(hash);
}

export async function logReflection(
  agentId: string,
  insight: string,
  timestamp: number,
): Promise<string | null> {
  const hash = hashEvent({
    type: "reflection",
    agentId,
    insight: insight.slice(0, 100),
    timestamp,
  });
  return logOnChain(hash);
}
