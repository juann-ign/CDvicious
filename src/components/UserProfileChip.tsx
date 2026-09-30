"use client";

import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "@/types/spotify";
import {
  ClientProfileError,
  getClientUserProfile,
} from "@/lib/clientProfile";
import { useSpotifyPlayer } from "./SpotifyPlayerProvider";
import styles from "./UserProfileChip.module.css";

export function UserProfileChip() {
  const { authenticated } = useSpotifyPlayer();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const retryAttemptedRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    if (authenticated !== true) {
      setProfile(null);
      setRateLimited(false);
      setQuotaExceeded(false);
      setRateLimitSeconds(null);
      retryAttemptedRef.current = false;
      return;
    }

    let active = true;

    const scheduleRetry = (retryAfter: number, loadProfile: () => void) => {
      setRateLimitSeconds(retryAfter);

      let remaining = retryAfter;
      countdownTimerRef.current = window.setInterval(() => {
        remaining = Math.max(0, remaining - 1);
        setRateLimitSeconds(remaining);
        if (remaining === 0 && countdownTimerRef.current !== null) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      }, 1000);

      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        if (!active) return;
        setRateLimitSeconds(null);
        loadProfile();
      }, retryAfter * 1000);
    };

    const loadProfile = async () => {
      try {
        const data = await getClientUserProfile();

        if (!active) return;

        setProfile(data);
        setRateLimited(false);
        setQuotaExceeded(false);
        setRateLimitSeconds(null);
      } catch (error) {
        if (!active) return;

        if (error instanceof ClientProfileError && error.status === 429) {
          setProfile(null);

          if (error.reason === "QUOTA_EXCEEDED") {
            setQuotaExceeded(true);
            setRateLimited(false);
            setRateLimitSeconds(null);
            return;
          }

          setQuotaExceeded(false);
          setRateLimited(true);

          if (
            !retryAttemptedRef.current &&
            error.retryAfter !== undefined
          ) {
            retryAttemptedRef.current = true;
            scheduleRetry(error.retryAfter, loadProfile);
          } else {
            setRateLimitSeconds(null);
          }

          return;
        }

        setProfile(null);
        setRateLimited(false);
        setRateLimitSeconds(null);
      }
    };

    retryAttemptedRef.current = false;
    setRateLimited(false);
    setQuotaExceeded(false);
    setRateLimitSeconds(null);
    void loadProfile();

    return () => {
      active = false;

      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
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
            (quotaExceeded
              ? "SPOTIFY QUOTA EXCEEDED"
              : rateLimited
                ? rateLimitSeconds !== null
                  ? `RATE LIMITED / RETRY IN ${rateLimitSeconds}s`
                  : "RATE LIMITED"
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
