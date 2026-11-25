"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { DiscMesh } from "./DiscMesh";
import { Environment } from "@react-three/drei";
import type { Group } from "three";
import type { DiscDragOptions, DiscDragState } from "@/hooks/useDiscDrag";

const FULL_DPR: [number, number] = [1, 2];
// Fractional rail translations can move transformed bounds across an integer.
// Measure layout size so a translation cannot resize the WebGL drawing buffer.
const CANVAS_RESIZE = { offsetSize: true };

interface DiscCanvasProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  accentColor: string;
  renderEnabled?: boolean;
  isRailMoving?: boolean;
  dragOptions?: DiscDragOptions;
  onDiscFrame?: (group: Group, state: DiscDragState) => void;
  onFirstFrame?: (canvas: HTMLCanvasElement) => void;
  onContextAvailability?: (available: boolean) => void;
}

function FirstFrame({ onReady }: { onReady: (canvas: HTMLCanvasElement) => void }) {
  const { gl } = useThree();
  const completed = useRef(false);
  const callback = useRef(onReady); callback.current = onReady;
  useFrame(() => {
    if (completed.current) return;
    // R3F renders after useFrame subscribers. This microtask acknowledges the
    // real draw, with the same Suspense boundary as the mesh and environment.
    queueMicrotask(() => {
      if (completed.current || gl.info.render.calls === 0) return;
      completed.current = true; callback.current(gl.domElement);
    });
  });
  return null;
}

export function DiscCanvas({
  track,
  isPlaying,
  accentColor,
  renderEnabled = true,
  isRailMoving = false,
  dragOptions,
  onDiscFrame,
  onFirstFrame,
  onContextAvailability,
}: DiscCanvasProps) {
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [documentVisible, setDocumentVisible] = useState(true);
  const [contextLost, setContextLost] = useState(false);
  const [contextEpoch, setContextEpoch] = useState(0);

  // Visibility and WebGL context state are independent: a visible tab must not
  // resume rendering while its canvas still has a lost context.
  const frameloop: "always" | "never" =
    !renderEnabled || !documentVisible || contextLost || isRailMoving
      ? "never"
      : "always";
  // Avoid reconfiguring renderer DPR and shadows during wheel input. R3F
  // renderer changes can block the main thread right as Lenis begins moving.
  // Keep the last composited frame and pause only the render loop.

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
      onContextAvailability?.(false);
      console.warn(
        "[DiscCanvas] WebGL context lost; frameloop paused until restoration",
      );
    };

    const handleRestored = () => {
      setContextLost(false);
      setContextEpoch(value => value + 1);
      onContextAvailability?.(true);
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
  }, [canvasElement, onContextAvailability]);

  return (
    <Canvas
      shadows
      dpr={FULL_DPR}
      resize={CANVAS_RESIZE}
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

      <Suspense fallback={null}>
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

        <DiscMesh
          track={track}
          isPlaying={isPlaying}
          accentColor={accentColor}
          dragOptions={dragOptions}
          onDiscFrame={onDiscFrame}
        />
        {onFirstFrame && <FirstFrame key={contextEpoch} onReady={onFirstFrame} />}
      </Suspense>
    </Canvas>
  );
}
