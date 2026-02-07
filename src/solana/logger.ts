import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import crypto from "crypto";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

let connection: Connection | null = null;
let payer: Keypair | null = null;
let enabled = false;

// Queue for offline logging when Solana is unavailable
const offlineLog: Array<{ hash: string; type: string; timestamp: number }> = [];

export function initSolanaLogger(payerSecret?: string) {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  connection = new Connection(rpcUrl, "confirmed");

  if (payerSecret) {
    try {
      const secretKey = Uint8Array.from(JSON.parse(payerSecret));
      payer = Keypair.fromSecretKey(secretKey);
      enabled = true;
      console.log(`Solana logger initialized. Payer: ${payer.publicKey.toBase58()}`);
    } catch {
      console.warn("Invalid SOLANA_PRIVATE_KEY, on-chain logging disabled");
    }
  } else {
    console.log("No SOLANA_PRIVATE_KEY set, on-chain logging disabled (events logged locally)");
  }
}

export function isLoggerEnabled(): boolean {
  return enabled;
}

export function getOfflineLog() {
  return offlineLog;
}

export function hashEvent(data: Record<string, unknown>): string {
  const json = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash("sha256").update(json).digest("hex");
}

// Log event hash on-chain using SPL Memo program
export async function logOnChain(eventHash: string, memo: string): Promise<string | null> {
  // Always store locally
  offlineLog.push({ hash: eventHash, type: memo.split("|")[0], timestamp: Date.now() });

  if (!connection || !payer || !enabled) {
    return null;
  }

  try {
    const memoData = `smallville|${memo}|${eventHash.slice(0, 16)}`;
    const transaction = new Transaction().add(
      new TransactionInstruction({
        keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memoData),
      }),
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log(`On-chain: ${memo} tx:${signature.slice(0, 16)}...`);
    return signature;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't spam logs for expected failures (no SOL, rate limits)
    if (!msg.includes("Insufficient")) {
      console.warn(`On-chain log failed: ${msg.slice(0, 80)}`);
    }
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
  return logOnChain(hash, `convo|${participants.join(",")}|${location}|${messageCount}msgs`);
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
  return logOnChain(hash, `reflect|${agentId}|${insight.slice(0, 40)}`);
}

export async function logPlanCreated(
  agentId: string,
  overview: string,
  day: number,
): Promise<string | null> {
  const hash = hashEvent({ type: "plan", agentId, overview: overview.slice(0, 100), day });
  return logOnChain(hash, `plan|${agentId}|day${day}`);
}
