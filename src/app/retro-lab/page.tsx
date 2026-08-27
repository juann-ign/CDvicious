"use client";

import { useState } from "react";

export default function RetroLab() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#121316",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        color: "#eceef0",
        gap: "30px",
        padding: "20px",
      }}
    >
      <h2
        style={{
          fontSize: "14px",
          letterSpacing: "2px",
          color: "#82848a",
          textTransform: "uppercase",
        }}
      >
        Laboratorio Estético // CDvicious Retro-Lab
      </h2>

      {/* 1. EL JEWEL CASE (Caja de acrílico interactiva) */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "relative",
          width: "300px",
          height: "300px",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.01) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: "12px",
          boxShadow:
            "0 25px 50px rgba(0,0,0,0.8), inset 0 0 20px rgba(255,255,255,0.05)",
          backdropFilter: "blur(6px)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: isOpen
            ? "perspective(1000px) rotateY(-15deg) translateY(-5px)"
            : "perspective(1000px) rotateY(0deg)",
          transition: "transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)",
        }}
      >
        {/* Bisagra de la caja */}
        <div
          style={{
            position: "absolute",
            left: "8px",
            top: 0,
            bottom: 0,
            width: "14px",
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.02))",
            borderRight: "1px solid rgba(255,255,255,0.15)",
          }}
        />

        {/* El CD Girando adentro */}
        <div
          style={{
            width: "220px",
            height: "220px",
            borderRadius: "50%",
            background: "conic-gradient(#111, #333, #111, #444, #111)",
            boxShadow: "0 0 20px rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: isOpen && isPlaying ? "spin 3s linear infinite" : "none",
            border: "2px solid rgba(255,255,255,0.1)",
          }}
        >
          {/* Hueco central del CD */}
          <div
            style={{
              width: "50px",
              height: "50px",
              borderRadius: "50%",
              background: "#121316",
              border: "4px solid rgba(255,255,255,0.3)",
            }}
          />
        </div>

        {/* Indicador de estado sobre la caja */}
        <div
          style={{
            position: "absolute",
            bottom: "12px",
            fontSize: "10px",
            letterSpacing: "1px",
            color: isOpen ? "#39ff14" : "#82848a",
          }}
        >
          {isOpen
            ? "▶ CAJA ABIERTA (HACER CLIC PARA CERRAR)"
            : "⚡ HACER CLIC PARA ABRIR CAJA"}
        </div>
      </div>

      {/* 2. EL DISPLAY LCD VFD (Fósforo verde) */}
      <div
        style={{
          background: "#070c08",
          border: "2px inset #1b301c",
          borderRadius: "6px",
          padding: "14px 18px",
          width: "300px",
          boxShadow:
            "inset 0 3px 6px rgba(0,0,0,0.9), 0 0 15px rgba(57, 255, 20, 0.15)",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            color: "#39ff14",
            textShadow: "0 0 8px rgba(57, 255, 20, 0.7)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: "6px",
          }}
        >
          All Falls Down
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "11px",
            color: "#228b15",
          }}
        >
          <span>Kanye West</span>
          <span style={{ letterSpacing: "1px" }}>01:42 / 03:43</span>
        </div>
      </div>

      {/* Botón de prueba para simular Play */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsPlaying(!isPlaying);
        }}
        style={{
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.2)",
          color: "#eceef0",
          padding: "8px 16px",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "12px",
        }}
      >
        {isPlaying ? "Pausar Giro" : "Girar Disco"}
      </button>

      <style jsx>{`
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
