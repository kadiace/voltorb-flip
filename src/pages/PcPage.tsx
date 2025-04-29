import React, { useEffect, useState } from "react";
import { Board } from "../components/Board";
import "../components/Board.css";

export const PcPage: React.FC = () => {
  const [isVertical, setIsVertical] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      setIsVertical(window.innerWidth < window.innerHeight);
    };
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    return () => window.removeEventListener("resize", checkOrientation);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isVertical ? "column" : "row",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Board 영역 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          aspectRatio: "1 / 1",
        }}
      >
        <div style={{ width: "min(90vmin, 600px)", height: "min(90vmin, 600px)" }}>
          <Board />
        </div>
      </div>

      {/* 광고 영역 */}
      <div
        style={{
          flex: 1,
          backgroundColor: "#f4f4f4",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "1.2rem", color: "#666" }}>📢 광고 영역</span>
      </div>
    </div>
  );
};
