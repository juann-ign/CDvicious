"use client";

import { useEffect, useState } from "react";
import type { UserProfile } from "@/types/spotify";

export function UserProfileChip() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((d) => setAuthenticated(d.authenticated));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [authenticated]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  if (authenticated === null) return null;

  if (!authenticated) {
    return (
      <a href="/api/auth/login" className="profile-chip profile-chip--connect">
        Conectar con Spotify
      </a>
    );
  }

  return (
    <div className="profile-chip">
      <button
        className="profile-chip__trigger"
        onClick={() => setOpen((o) => !o)}
      >
        {profile?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatarUrl}
            alt=""
            className="profile-chip__avatar"
          />
        ) : (
          <div className="profile-chip__avatar profile-chip__avatar--placeholder" />
        )}
        <span className="profile-chip__name">
          {profile?.displayName ?? "Cuenta"}
        </span>
      </button>
      {open && (
        <div className="profile-chip__menu">
          <button onClick={handleLogout}>Desconectar</button>
        </div>
      )}
    </div>
  );
}
