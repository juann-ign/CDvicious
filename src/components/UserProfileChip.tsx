"use client";

import { useEffect, useState } from "react";
import type { UserProfile } from "@/types/spotify";
import styles from "./UserProfileChip.module.css";

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
      <a href="/api/auth/login" className={styles.profileConnect}>
        CONECTAR SPOTIFY
      </a>
    );
  }

  return (
    <div className={styles.profileContainer}>
      <button
        className={styles.profileTrigger}
        onClick={() => setOpen((o) => !o)}
      >
        {profile?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className={styles.avatar} />
        ) : (
          <div className={`${styles.avatar} ${styles.avatarPlaceholder}`} />
        )}
        <span className={styles.username}>
          {profile?.displayName ?? "USUARIO"}
        </span>
      </button>

      {open && (
        <div className={styles.menu}>
          <button onClick={handleLogout}>DESCONECTAR</button>
        </div>
      )}
    </div>
  );
}
