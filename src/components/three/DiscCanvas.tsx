"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { DiscMesh } from "./DiscMesh";
import { Environment } from "@react-three/drei";

interface DiscCanvasProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  accentColor: string;
}

export function DiscCanvas({ track, isPlaying, accentColor }: DiscCanvasProps) {
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");

  useEffect(() => {
    function handleVisibility() {
      setFrameloop(document.hidden ? "never" : "always");
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;

    const handleLost = (e: Event) => {
      e.preventDefault();
      console.error("[DiscCanvas] WebGL context lost — pausando frameloop");
      setFrameloop("never");
    };
    const handleRestored = () => {
      console.warn("[DiscCanvas] WebGL context restored");
      setFrameloop("always");
    };

    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    };
  }, []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop={frameloop}
      camera={{ position: [0, 0.7, 4.6], fov: 40 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={1.4} />

      <Environment
        files="/hdri/studio_small_03_1k.hdr"
        environmentIntensity={0.35}
      />

      <directionalLight
        position={[3, 5, 4]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight
        position={[-3, 1.5, -2]}
        color={accentColor}
        intensity={isPlaying ? 3.5 : 0.8}
      />

      <Suspense fallback={null}>
        <DiscMesh
          track={track}
          isPlaying={isPlaying}
          accentColor={accentColor}
        />
      </Suspense>
    </Canvas>
  );
}
