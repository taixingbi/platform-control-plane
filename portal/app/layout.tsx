import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bedrock Gateway Portal",
  description: "Internal admin portal for the Bedrock Gateway platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-sm text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
