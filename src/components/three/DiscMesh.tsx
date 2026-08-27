"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import type { Group, Mesh } from "three";
import type { SpotifyTrack } from "@/types/spotify";
import { useDiscDrag } from "@/hooks/useDiscDrag";
import "./DiscSheenMaterial";

interface DiscMeshProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  accentColor: string;
}

const RAY_COLORS = ["#a0f0ff", "#ffd2f5", "#beddff", "#ffffff", "#b4fff0"];

// Anatomia de un CD real, en unidades de escena. Mismas proporciones que un
// CD fisico (120mm de diametro, agujero de 15mm) escaladas a radio 1.5.
const OUTER_RADIUS = 1.5;
const HOLE_RADIUS = OUTER_RADIUS * 0.125; // ~15mm/120mm de un CD real
const BRIGHT_RING_RADIUS = HOLE_RADIUS * 1.7; // aro metalico alrededor del agujero
const THICKNESS = 0.04;

export function DiscMesh({ track, isPlaying, accentColor }: DiscMeshProps) {
  const groupRef = useRef<Group>(null!);
  const sheenRef = useRef<any>(null);
  const laserRef = useRef<Mesh>(null);
  const previousTrackId = useRef<string | null>(null);

  const { onPointerDown, onPointerMove, onPointerUp } = useDiscDrag(groupRef);

  const coverUrl = track?.album.images[0]?.url;
  const FALLBACK_COVER =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQ0TUEAAETAIvi6xJZAAAAAElFTkSuQmCC";
  const coverTexture = useTexture(coverUrl ?? FALLBACK_COVER);

  useEffect(() => {
    coverTexture.colorSpace = THREE.SRGBColorSpace;
    coverTexture.needsUpdate = true;
    coverTexture.wrapS = coverTexture.wrapT = THREE.ClampToEdgeWrapping;
    coverTexture.center.set(0.5, 0.5);
  }, [coverTexture]);

  const accent = useMemo(() => new THREE.Color(accentColor), [accentColor]);

  useEffect(() => {
    if (!sheenRef.current) return;
    gsap.to(sheenRef.current.uniforms.uActive, {
      value: isPlaying ? 1 : 0,
      duration: 0.6,
      ease: "power2.out",
    });
  }, [isPlaying]);

  useFrame((_, delta) => {
    if (sheenRef.current) sheenRef.current.uniforms.uTime.value += delta;
  });

  useEffect(() => {
    return () => {
      if (sheenRef.current) {
        gsap.killTweensOf(sheenRef.current.uniforms.uActive);
        sheenRef.current.dispose();
      }
      if (laserRef.current) {
        gsap.killTweensOf(laserRef.current.rotation);
        gsap.killTweensOf(laserRef.current.scale);
      }
    };
  }, []);

  useEffect(() => {
    if (!track) {
      previousTrackId.current = null;
      return;
    }
    if (previousTrackId.current === null) {
      previousTrackId.current = track.id;
      return;
    }
    if (track.id !== previousTrackId.current) {
      previousTrackId.current = track.id;
      if (laserRef.current) {
        gsap.fromTo(
          laserRef.current.rotation,
          { z: 0 },
          { z: Math.PI * 6, duration: 0.7, ease: "power3.out" },
        );
        gsap.fromTo(
          laserRef.current.scale,
          { x: 1, y: 1, z: 1 },
          {
            x: 0.001,
            y: 0.001,
            z: 0.001,
            duration: 0.7,
            ease: "power3.out",
            delay: 0.05,
          },
        );
      }
    }
  }, [track]);

  return (
    <group
      ref={groupRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <mesh
        position={[0, THICKNESS / 2, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
      >
        <ringGeometry args={[HOLE_RADIUS, OUTER_RADIUS, 96, 1]} />
        <meshStandardMaterial
          map={coverTexture}
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>

      <mesh
        position={[0, -THICKNESS / 2, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
      >
        <ringGeometry args={[HOLE_RADIUS, OUTER_RADIUS, 96, 1]} />
        <meshStandardMaterial
          color="#a8abb3"
          roughness={0.25}
          metalness={0.8}
          emissive={isPlaying ? accent : "#000000"}
          emissiveIntensity={isPlaying ? 0.35 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh castShadow>
        <cylinderGeometry
          args={[OUTER_RADIUS, OUTER_RADIUS, THICKNESS, 96, 1, true]}
        />
        <meshStandardMaterial
          color="#d8dadf"
          roughness={0.15}
          metalness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh>
        <cylinderGeometry
          args={[HOLE_RADIUS, HOLE_RADIUS, THICKNESS, 48, 1, true]}
        />
        <meshStandardMaterial
          color="#050506"
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        position={[0, THICKNESS / 2 + 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[HOLE_RADIUS, BRIGHT_RING_RADIUS, 48]} />
        <meshStandardMaterial color="#f4f5f7" roughness={0.1} metalness={1} />
      </mesh>
      <mesh
        position={[0, -THICKNESS / 2 - 0.001, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[HOLE_RADIUS, BRIGHT_RING_RADIUS, 48]} />
        <meshStandardMaterial color="#f4f5f7" roughness={0.1} metalness={1} />
      </mesh>

      <mesh
        position={[0, THICKNESS / 2 + 0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[HOLE_RADIUS, OUTER_RADIUS, 96, 1]} />
        <discSheenMaterial
          ref={sheenRef}
          uAccentColor={accent}
          transparent
          depthWrite={false}
        />
      </mesh>

      {isPlaying && (
        <group
          position={[0, -THICKNESS / 2 - 0.003, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          {RAY_COLORS.map((color, i) => (
            <mesh
              key={color}
              rotation={[0, 0, (i / RAY_COLORS.length) * Math.PI * 2]}
            >
              <coneGeometry args={[0.75, 1.4, 3, 1, true, 0, 0.35]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.55}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      )}

      <mesh
        ref={laserRef}
        position={[0, THICKNESS / 2 + 0.003, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={0.001}
      >
        <ringGeometry args={[HOLE_RADIUS, OUTER_RADIUS, 64]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
