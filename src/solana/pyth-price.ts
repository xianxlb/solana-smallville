// Pyth Oracle integration — fetch live SOL/USD price from Hermes
const PYTH_SOL_USD_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const HERMES_URL = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_SOL_USD_ID}`;

export type PriceEvent = "pump" | "dump" | "extreme_pump" | "extreme_dump";

interface PricePoint {
  price: number;
  timestamp: number;
}

export class PriceTracker {
  private history: PricePoint[] = [];
  private lastUpdate = 0;

  get currentPrice(): number | null {
    return this.history.length > 0 ? this.history[this.history.length - 1].price : null;
  }

  get priceChange(): number | null {
    if (this.history.length < 2) return null;
    const prev = this.history[this.history.length - 2].price;
    const curr = this.history[this.history.length - 1].price;
    return ((curr - prev) / prev) * 100;
  }

  get lastUpdateTime(): number {
    return this.lastUpdate;
  }

  async fetchPrice(): Promise<number | null> {
    try {
      const res = await fetch(HERMES_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;

      const data = await res.json();
      const parsed = data?.parsed;
      if (!parsed || !parsed[0]?.price) return null;

      const priceData = parsed[0].price;
      const price = Number(priceData.price) * Math.pow(10, priceData.expo);

      this.history.push({ price, timestamp: Date.now() });
      if (this.history.length > 20) this.history.shift();
      this.lastUpdate = Date.now();

      return price;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Pyth price fetch failed: ${msg.slice(0, 80)}`);
      return null;
    }
  }

  detectEvent(): PriceEvent | null {
    if (this.history.length < 6) return null;

    const current = this.history[this.history.length - 1].price;
    const recentSlice = this.history.slice(-6, -1);
    const avg = recentSlice.reduce((s, p) => s + p.price, 0) / recentSlice.length;
    const changePct = ((current - avg) / avg) * 100;

    if (changePct >= 8) return "extreme_pump";
    if (changePct <= -8) return "extreme_dump";
    if (changePct >= 3) return "pump";
    if (changePct <= -3) return "dump";
    return null;
  }

  getSnapshot() {
    return {
      price: this.currentPrice,
      change: this.priceChange,
      lastUpdate: this.lastUpdate || null,
    };
  }
}
