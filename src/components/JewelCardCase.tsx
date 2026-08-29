"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface JewelCaseCardProps {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
}

export function JewelCaseCard({
  id,
  title,
  artist,
  coverUrl,
}: JewelCaseCardProps) {
  const [isOpening, setIsOpening] = useState(false);
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isOpening) return;

    setIsOpening(true);

    setTimeout(() => {
      router.push(`/?album=${id}`);
    }, 2600);
  };

  return (
    <div
      className={`jewel-case-wrapper ${isOpening ? "is-opening" : ""}`}
      onClick={handleClick}
    >
      {/* 1. BANDEJA TRASERA (Tray interior de plástico con el CD montado) */}
      <div className="jewel-back-tray">
        {/* Estructura moldeada típica de una bandeja de CD */}
        <div className="tray-mold">
          <div className="tray-center-hub" />
        </div>

        {/* CD Metálico con la carátula impresa encima (Estilo real) */}
        <div className="cd-disc">
          <div className="cd-art-overlay">
            <Image
              src={coverUrl}
              alt={title}
              fill
              className="cd-art-img"
              unoptimized
            />
          </div>
          <div className="cd-reflection" />
          <div className="cd-inner-ring" />
          <div className="cd-inner-hub" />
        </div>
      </div>

      {/* 2. TAPA FRONTAL 3D (Portada exterior + Interior con librito desplegado) */}
      <div className="jewel-front">
        {/* Cara Delantera (Portada exterior y lomo) */}
        <div className="jewel-front-inner front-face">
          <div className="jewel-spine">
            <span className="spine-text">
              {artist} - {title}
            </span>
          </div>
          <div className="jewel-cover-art">
            <Image
              src={coverUrl}
              alt={`${title} cover`}
              fill
              className="cover-img"
              sizes="(max-width: 768px) 50vw, 200px"
              unoptimized
            />
            <div className="acrylic-glare" />
          </div>
        </div>

        {/* Cara Trasera / Interior (Librito de papel texturizado con gradiente artístico) */}
        <div className="jewel-front-inner back-face">
          <div className="booklet-inner-content">
            <div className="booklet-art-bg">
              <Image
                src={coverUrl}
                alt="bg"
                fill
                className="blur-bg"
                unoptimized
              />
            </div>
            <div className="booklet-text-info">
              <span className="inside-artist">{artist}</span>
              <h4 className="inside-title">{title}</h4>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .jewel-case-wrapper {
          position: relative;
          width: 88%;
          aspect-ratio: 1.2 / 1;
          cursor: pointer;
          perspective: 1400px;
          overflow: visible !important;
          z-index: 1;
        }

        .jewel-case-wrapper:hover {
          z-index: 9999;
        }

        /* --- BANDEJA TRASERA (TRAY) --- */
        .jewel-back-tray {
          position: absolute;
          inset: 0;
          background: #181a1c;
          border-radius: 2px 4px 4px 2px;
          border: 1px solid #2a2f35;
          box-shadow: inset 0 0 25px rgba(0, 0, 0, 0.9);
          z-index: 1;
          overflow: visible;
        }

        /* Relieve de plástico moldeado del tray */
        .tray-mold {
          position: absolute;
          inset: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 2px;
          background: radial-gradient(circle, #222528 0%, #121416 80%);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tray-center-hub {
          width: 35%;
          height: 35%;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: #0d0e10;
          box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.9);
        }

        /* --- ESTÉTICA DEL CD REAL (Plata reflectante + Arte impreso) --- */
        .cd-disc {
          position: absolute;
          top: 3%;
          right: 12%;
          width: 82%;
          aspect-ratio: 1 / 1;
          border-radius: 50%;
          z-index: 2;
          transition: transform 0.8s cubic-bezier(0.25, 1, 0.5, 1);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* El arte de tapa impreso translúcido sobre el disco plateado */
        .cd-art-overlay {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          overflow: hidden;
          opacity: 0.75; /* Deja transpirar el brillo metálico de fondo */
          mix-blend-mode: overlay;
        }

        .cd-art-img {
          object-fit: cover;
        }

        /* Reflejo especular tornasolado sobre el CD */
        .cd-reflection {
          position: absolute;
          inset: 0;
          background: conic-gradient(
            from 0deg at 50% 50%,
            rgba(255, 255, 255, 0) 0deg,
            rgba(255, 255, 255, 0.3) 60deg,
            rgba(255, 255, 255, 0) 120deg,
            rgba(255, 255, 255, 0.2) 240deg,
            rgba(255, 255, 255, 0) 360deg
          );
          pointer-events: none;
          border-radius: 50%;
        }

        .jewel-case-wrapper:hover:not(.is-opening) .cd-disc {
          transform: translateX(56%) rotate(360deg);
        }

        .cd-inner-ring {
          position: absolute;
          width: 35%;
          height: 35%;
          border: 1px dashed rgba(0, 0, 0, 0.4);
          border-radius: 50%;
          z-index: 4;
        }

        .cd-inner-hub {
          width: 18%;
          height: 18%;
          background: #111;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.8);
          box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.9);
          z-index: 5;
        }

        /* --- TAPA FRONTAL 3D --- */
        .jewel-front {
          position: absolute;
          inset: 0;
          z-index: 3;
          transform-style: preserve-3d;
          transform-origin: left center;
          transition: transform 3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .jewel-case-wrapper:hover:not(.is-opening) .jewel-front {
          transform: translateY(-6px) scale(1.03);
          box-shadow: 12px 18px 30px rgba(0, 0, 0, 0.95);
        }

        .jewel-case-wrapper.is-opening .jewel-front {
          transform: rotateY(-130deg);
        }

        .jewel-front-inner {
          position: absolute;
          inset: 0;
          display: flex;
          border-radius: 2px 4px 4px 2px;
          backface-visibility: hidden;
          border: 1px solid #2a2f35;
          box-shadow: 5px 5px 15px rgba(0, 0, 0, 0.8);
        }

        .front-face {
          background: #111;
          z-index: 2;
        }

        /* --- INTERIOR DE LA TAPA (LIBRITO DESPLEGADO CON GRADIENTE) --- */
        .back-face {
          background: #f4f1ea;
          transform: rotateY(180deg);
          padding: 0;
          overflow: hidden;
          box-shadow: inset 15px 0 30px rgba(0, 0, 0, 0.3);
        }

        .booklet-inner-content {
          position: absolute;
          width: 100%;
          height: 100%;
          inset: 0;
        }

        .booklet-art-bg {
          display: none;
        }

        .booklet-text-info {
          position: absolute;
          inset: 0;
          z-index: 2;
          background: #141619;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 16px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        }

        .inside-artist {
          font-family: "Courier New", Courier, monospace;
          font-size: 14px;
          text-transform: uppercase;
          color: #dddddd;
          display: block;
          letter-spacing: 2px;
          margin-bottom: 6px;
        }

        .inside-title {
          font-family: "Helvetica", Arial, sans-serif;
          font-size: 14px;
          font-weight: 800;
          margin: 0 0 10px 0;
          text-transform: uppercase;
          color: #ffffff;
          letter-spacing: -0.3px;
          line-height: 1.3;
        }

        .jewel-spine {
          width: 12%;
          background: #1a1a1a;
          border-right: 1px solid #000;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: inset -2px 0 5px rgba(0, 0, 0, 0.5);
        }

        .spine-text {
          writing-mode: vertical-rl;
          transform: scale(-1);
          font-family: monospace;
          font-size: 8px;
          color: #888;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-height: 90%;
        }

        .jewel-cover-art {
          position: relative;
          flex: 1;
          background: #000;
          overflow: hidden;
        }

        .cover-img {
          object-fit: cover;
        }

        .acrylic-glare {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            105deg,
            rgba(255, 255, 255, 0) 30%,
            rgba(255, 255, 255, 0.1) 45%,
            rgba(255, 255, 255, 0.25) 50%,
            rgba(255, 255, 255, 0.05) 52%,
            rgba(255, 255, 255, 0) 65%
          );
          pointer-events: none;
          z-index: 2;
        }
      `}</style>
    </div>
  );
}
