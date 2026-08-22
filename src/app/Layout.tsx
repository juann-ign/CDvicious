import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Desktop.fm",
  description: "Virtual interhuman connection through sound and music",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
