import * as THREE from "three";
import { shaderMaterial } from "@react-three/drei";
import { extend } from "@react-three/fiber";

export const DiscSheenMaterial = shaderMaterial(
  {
    uTime: 0,
    uAccentColor: new THREE.Color("#1DB954"),
    uActive: 0,
  },
  /* vertex */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  /* fragment */ `
    uniform float uTime;
    uniform float uActive;
    uniform vec3 uAccentColor;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 3.0);
      vec3 rainbow = 0.5 + 0.5 * cos(
        uTime * 0.6 + vNormal.xyx * 3.0 + vec3(0.0, 2.0, 4.0)
      );
      float mixAmount = fresnel * mix(0.12, 0.4, uActive);
      vec3 color = mix(uAccentColor, rainbow, mixAmount);
      gl_FragColor = vec4(color, fresnel * mix(0.15, 0.7, uActive));
    }
  `,
);

extend({ DiscSheenMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    discSheenMaterial: any;
  }
}
