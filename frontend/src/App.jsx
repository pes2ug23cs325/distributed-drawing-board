import React, { useState, useEffect } from "react";
import Canvas from "./Canvas";
import Toolbar from "./Toolbar";
import useWebSocket from "./useWebSocket";

export default function App() {
  const [strokes, setStrokes] = useState([]);
  const [color, setColor] = useState("#000000");
  const [tool, setTool] = useState("pen");
  const [lineWidth, setLineWidth] = useState(3);
  const [leader, setLeader] = useState("unknown");

  const { connected, sendStroke } = useWebSocket(
    "ws://localhost:3000",
    (data) => {
      if (data.type === "clear") {
        setStrokes([]);
      } else if (data.type === "stroke" && data.payload) {
        // 🔥 Deduplication removed! Eraser scrubbing perfectly synced.
        setStrokes((prev) => [...prev, data.payload]);
      } else if (data.type === "init" && Array.isArray(data.payload)) {
        setStrokes(data.payload);
      }
    }
  );

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:3000/health");
        const data = await res.json();
        setLeader(data.leader || "unknown");
      } catch {
        setLeader("disconnected");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  function handleDraw(stroke) {
    setStrokes((prev) => [...prev, stroke]); 
    sendStroke({ type: "stroke", payload: stroke });
  }

  function handleClear() {
    setStrokes([]);
    sendStroke({ type: "clear" });
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.left}>Leader: {leader}</div>

        <div style={styles.center}>
          <h1 style={styles.title}>Distributed Drawing Board</h1>
        </div>

        <div style={styles.right}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: connected ? "#10b981" : "#ef4444",
              marginRight: 8,
            }}
          />
          <span style={styles.statusText}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      <Toolbar
        color={color}
        setColor={setColor}
        tool={tool}
        setTool={setTool}
        lineWidth={lineWidth}
        setLineWidth={setLineWidth}
        clearCanvas={handleClear}
      />

      <Canvas
        strokes={strokes}
        color={color}
        tool={tool}
        lineWidth={lineWidth}
        onDraw={handleDraw}
      />
    </div>
  );
}

const styles = {
  page: {
    width: "100vw",
    height: "100vh",
    position: "fixed",
    top: 0,
    left: 0,
    fontFamily: "'Inter', sans-serif",
    background: "#f0f0f0",
    overflow: "hidden",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "56px",
    background: "linear-gradient(90deg, #0ea5e9, #4f46e5, #9333ea)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    boxSizing: "border-box",
    color: "white",
    zIndex: 10,
  },
  left: {
    fontSize: "15px",
    fontWeight: "500",
    flex: 1,
  },
  center: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: "18px",
    fontWeight: "700",
    margin: 0,
  },
  right: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  statusText: {
    fontSize: "15px",
    fontWeight: "500",
  },
};