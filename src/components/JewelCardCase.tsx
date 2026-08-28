"use client";

import Image from "next/image";

interface JewelCaseCardProps {
  title: string;
  artist: string;
  coverUrl: string;
}

export function JewelCaseCard({ title, artist, coverUrl }: JewelCaseCardProps) {
  return (
    <div className="jewel-case-wrapper">
      {/* El CD real: Plateado, brillante, metálico y sin rastro de negro */}
      <div className="cd-disc">
        <div className="cd-inner-ring" />
        <div className="cd-inner-hub" />
      </div>

      {/* La caja de acrílico */}
      <div className="jewel-case">
        <div className="jewel-spine">
          <span className="spine-text">
            {artist} - {title}
          </span>
        </div>

        <div className="jewel-cover">
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

      <style jsx>{`
        .jewel-case-wrapper {
          position: relative;
          width: 100%;
          aspect-ratio: 1.15 / 1;
          cursor: pointer;
          perspective: 1000px;
          transition: z-index 0s ease 0s;
        }

        .jewel-case-wrapper:hover {
          z-index: 100;
        }

        /* --- ESTÉTICA DEL CD PLATEADO REAL --- */
        .cd-disc {
          position: absolute;
          top: 9%;
          right: 12%;
          width: 82%;
          height: 82%;
          /* Gradiente radial metálico plateado/blanco (efecto CD virgen) */
          background: radial-gradient(
            circle,
            #e8e8e8 0%,
            #ffffff 12%,
            #b0b0b0 25%,
            #f2f2f2 40%,
            #999999 55%,
            #e5e5e5 70%,
            #aaaaaa 85%,
            #d0d0d0 100%
          );
          border-radius: 50%;
          z-index: 0;
          transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);
          box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Anillo interno de lectura del CD */
        .cd-inner-ring {
          position: absolute;
          width: 45%;
          height: 45%;
          border: 1px dashed rgba(255, 255, 255, 0.5);
          border-radius: 50%;
          pointer-events: none;
        }

        /* El agujero central del CD */
        .cd-inner-hub {
          width: 22%;
          height: 22%;
          background: #1a1a1a;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.6);
          box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.9);
        }

        /* Hover: El CD se desliza hacia la derecha */
        .jewel-case-wrapper:hover .cd-disc {
          transform: translateX(52%) rotate(120deg);
        }

        /* --- CAJA DE ACRÍLICO --- */
        .jewel-case {
          position: absolute;
          inset: 0;
          display: flex;
          background: #111;
          border-radius: 2px 4px 4px 2px;
          box-shadow:
            5px 5px 15px rgba(0, 0, 0, 0.8),
            inset 1px 1px 2px rgba(255, 255, 255, 0.2);
          z-index: 1;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
          border: 1px solid #222;
        }

        .jewel-case-wrapper:hover .jewel-case {
          transform: translateY(-6px) scale(1.03);
          box-shadow:
            12px 18px 30px rgba(0, 0, 0, 0.95),
            inset 1px 1px 2px rgba(255, 255, 255, 0.4);
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

        .jewel-cover {
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
