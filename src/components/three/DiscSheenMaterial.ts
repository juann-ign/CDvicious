import * as THREE from "three";
import { shaderMaterial } from "@react-three/drei";
import { extend } from "@react-three/fiber";

export const DiscSheenMaterial = shaderMaterial(
  {
    uTime: 0,
    uAccentColor: new THREE.Color("#1DB954"),
    uActive: 0,
  },
  /* vertex shader */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;
    
    void main() {
      vUv = uv; // Usamos UVs para mapear el barrido direccional
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  /* fragment shader */ `
    uniform float uTime;
    uniform float uActive;
    uniform vec3 uAccentColor;
    
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;

    void main() {
      // Fresnel para darle volumen 3D a los bordes
      float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 3.0);
      
      // 1. LÓGICA DE FASES (El loop de 6 segundos)
      // cycleTime: 6s totales (3s brillando, 3s opaco)
      float phase = step(4.0, mod(uTime, 8.0)); // Devuelve 0.0 (Fase Luz) o 1.0 (Fase Gris)
      float phaseTime = mod(uTime, 4.0);
      
      // 2. EL BARRIDO (Súper rápido y ancho)
      // La ola cruza en solo 0.85s, y luego reposa 2.15s iluminando/opacando
      float sweepProgress = smoothstep(0.0, 0.85, phaseTime);
      
      // Usamos una mezcla de X e Y para que la ola viaje en diagonal (queda más pro)
      float pos = (vUv.x + vUv.y) * 0.5; 
      
      // Mapeamos para que arranque bien afuera del CD y termine bien afuera
      float frontPos = mix(-0.3, 1.3, sweepProgress);
      
      // 'front' es el frente de la ola. Le damos un ancho enorme (0.35 para cada lado)
      float front = smoothstep(frontPos - 0.5, frontPos + 0.5, pos);
      
      // 3. LA MÁSCARA FINAL
      // Si estamos en Luz (phase=0), lo que va quedando atrás se prende (1.0).
      // Si estamos en Gris (phase=1), lo que va quedando atrás se apaga (0.0).
      float currentMask = mix(1.0 - front, front, phase);
      
      // Añadimos un "hotspot" (una franja de luz pura que lidera la ola)
      float transitionEdge = 1.0 - abs(front * 2.0 - 1.0);
      float hotSpot = pow(transitionEdge, 1.5) * uActive;

      // 4. COLORES (Gris vs Iridiscente)
      vec3 greyColor = vec3(0.65, 0.68, 0.72); // Plateado opaco
      vec3 rainbow = 0.5 + 0.5 * cos(uTime * 0.4 + vNormal.xyx * 2.5 + vec3(0.0, 2.0, 4.0));
      vec3 softRainbow = mix(rainbow, vec3(1.0), 0.65);
      vec3 brightColor = mix(uAccentColor, softRainbow, 0.30) * 1.4; // Luz saturada
      
      // Aplicamos la máscara a los colores
      vec3 finalColor = mix(greyColor, brightColor, currentMask);
      
      // Le sumamos blanco quemado en el pico de la ola
      finalColor += vec3(hotSpot * 1.2);

      // 5. TRANSPARENCIA (Alpha)
      // En gris es sutil (0.12) para dejar ver la portada. En luz es denso (0.45).
      float alphaBase = mix(0.12, 0.45, currentMask);
      
      // Sumamos opacidad dura en el hotspot
      float finalAlpha = (alphaBase + hotSpot * 0.5) * mix(0.1, 1.0, uActive);
      
      // Multiplicamos por fresnel para que los bordes del CD siempre destaquen
      finalAlpha *= (0.4 + fresnel * 0.8);
      
      gl_FragColor = vec4(finalColor, finalAlpha);
    }
  `,
);

extend({ DiscSheenMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    discSheenMaterial: any;
  }
}
