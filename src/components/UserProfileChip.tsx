"use client";

import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "@/types/spotify";
import { useSpotifyPlayer } from "./SpotifyPlayerProvider";
import styles from "./UserProfileChip.module.css";

export function UserProfileChip() {
  const { authenticated } = useSpotifyPlayer();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const retryAttemptedRef = useRef(false);

  useEffect(() => {
    if (authenticated !== true) {
      setProfile(null);
      setRateLimitSeconds(null);
      retryAttemptedRef.current = false;
      return;
    }

    let active = true;

    const loadProfile = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after") ?? "");
          const body = (await res.json().catch(() => null)) as {
            reason?: string;
          } | null;

          if (!active) return;

          if (
            !retryAttemptedRef.current &&
            Number.isFinite(retryAfter) &&
            retryAfter > 0
          ) {
            retryAttemptedRef.current = true;
            setRateLimitSeconds(retryAfter);

            const countdown = window.setInterval(() => {
              setRateLimitSeconds((remaining) =>
                remaining !== null && remaining > 1 ? remaining - 1 : 0,
              );
            }, 1000);

            window.setTimeout(() => {
              window.clearInterval(countdown);
              if (!active) return;
              setRateLimitSeconds(null);
              void loadProfile();
            }, retryAfter * 1000);
          } else {
            setRateLimitSeconds(null);
          }

          console.warn("Spotify profile rate limited:", body?.reason ?? "RATE_LIMITED");
          return;
        }

        if (!res.ok) {
          throw new Error(`auth/me failed: ${res.status}`);
        }

        const data = (await res.json()) as UserProfile;

        if (!active) return;

        setProfile(data);
        setRateLimitSeconds(null);
      } catch {
        if (!active) return;
        setProfile(null);
        setRateLimitSeconds(null);
      }
    };

    retryAttemptedRef.current = false;
    void loadProfile();

    return () => {
      active = false;
    };
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
          {profile?.displayName ??
            (rateLimitSeconds !== null
              ? `RATE LIMITED / RETRY IN ${rateLimitSeconds}s`
              : "USUARIO")}
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
