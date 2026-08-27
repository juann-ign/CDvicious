"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { DiscMesh } from "./DiscMesh";

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

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop={frameloop}
      camera={{ position: [0, 0.7, 5.6], fov: 40 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight
        position={[-3, 1.5, -2]}
        color={accentColor}
        intensity={isPlaying ? 2.2 : 0.6}
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
