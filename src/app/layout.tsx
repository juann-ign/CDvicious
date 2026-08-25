import type { Metadata } from "next";
import "./globals.css";
import { SpotifyPlayerProvider } from "@/components/SpotifyPlayerProvider";

export const metadata: Metadata = {
  title: "CDvicious",
  description: "Virtual interhuman connection through sound and music",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <SpotifyPlayerProvider>{children}</SpotifyPlayerProvider>
      </body>
    </html>
  );
}
