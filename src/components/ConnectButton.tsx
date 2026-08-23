"use client";

import { useEffect, useState } from "react";

export function ConnectButton() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => setAuthenticated(data.authenticated));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    window.location.reload();
  }

  if (authenticated === null) return null;

  if (authenticated) {
    return <button onClick={handleLogout}>Desconectar</button>;
  }

  return <a href="/api/auth/login">Conectar con Spotify</a>;
}
