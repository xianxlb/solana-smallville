import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Solana Smallville",
  description: "Generative agents simulation with Solana ecosystem personalities",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: "#2a3818", color: "#3a2818", fontFamily: "'Courier New', Courier, monospace" }}>
        {children}
      </body>
    </html>
  );
}
