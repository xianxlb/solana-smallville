import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Solana Smallville",
  description: "Generative agents simulation with Solana ecosystem personalities",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: "#0a0a0a", color: "#eee", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
