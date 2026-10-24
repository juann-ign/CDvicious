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
  renderEnabled?: boolean;
  isRailMoving?: boolean;
}

export function DiscCanvas({
  track,
  isPlaying,
  accentColor,
  renderEnabled = true,
  isRailMoving = false,
}: DiscCanvasProps) {
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [documentVisible, setDocumentVisible] = useState(true);
  const [contextLost, setContextLost] = useState(false);

  // Visibility and WebGL context state are independent: a visible tab must not
  // resume rendering while its canvas still has a lost context.
  const frameloop =
    renderEnabled && documentVisible && !contextLost
      ? ("always" as const)
      : ("never" as const);
  // During rail motion, reduce the still-visible Deck scene's GPU cost.
  // Full resolution and shadows resume as soon as navigation settles.
  const dpr: number | [number, number] = isRailMoving ? 1 : [1, 2];

  useEffect(() => {
    const updateVisibility = () => {
      setDocumentVisible(document.visibilityState === "visible");
    };

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);

    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (!canvasElement) return;

    const handleLost = (event: Event) => {
      // Prevent the browser's default permanent-loss behavior where supported.
      event.preventDefault();
      setContextLost(true);
      console.warn(
        "[DiscCanvas] WebGL context lost; frameloop paused until restoration",
      );
    };

    const handleRestored = () => {
      setContextLost(false);
      console.info("[DiscCanvas] WebGL context restored");
    };

    canvasElement.addEventListener("webglcontextlost", handleLost);
    canvasElement.addEventListener("webglcontextrestored", handleRestored);

    return () => {
      canvasElement.removeEventListener("webglcontextlost", handleLost);
      canvasElement.removeEventListener(
        "webglcontextrestored",
        handleRestored,
      );
    };
  }, [canvasElement]);

  return (
    <Canvas
      shadows={!isRailMoving}
      dpr={dpr}
      frameloop={frameloop}
      data-disc-frameloop={frameloop}
      data-disc-quality={isRailMoving ? "transition" : "full"}
      camera={{ position: [0, 0.7, 4.6], fov: 40 }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(0, 0, 0);
        // Listen to the canvas owned by this R3F instance, not the first
        // arbitrary canvas in the document.
        setCanvasElement(gl.domElement);
      }}
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
