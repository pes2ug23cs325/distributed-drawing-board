import React, { useState } from "react";
import Canvas from "./Canvas";
import Toolbar from "./Toolbar";
import useWebSocket from "./useWebSocket";

export default function App() {
  const [strokes, setStrokes] = useState([]);
  const [color, setColor] = useState("#000000");
  const [tool, setTool] = useState("pen");
  const [lineWidth, setLineWidth] = useState(3);

  const { connected, sendStroke } = useWebSocket(
    "ws://localhost:3000",
    (stroke) => {
      setStrokes((prev) => [...prev, stroke]);
    }
  );

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <div style={styles.header}>
        <h1 style={styles.title}>Distributed Drawing Board</h1>

        <div style={styles.status}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? "#10b981" : "#ef4444",
              marginRight: 6,
            }}
          />
          {connected ? "Connected" : "Disconnected"}
        </div>
      </div>

      {/* TOOLBAR */}
      <Toolbar
        color={color}
        setColor={setColor}
        tool={tool}
        setTool={setTool}
        lineWidth={lineWidth}
        setLineWidth={setLineWidth}
        clearCanvas={() => setStrokes([])}
      />

      {/* CANVAS */}
      <Canvas
        strokes={strokes}
        color={color}
        tool={tool}
        lineWidth={lineWidth}
        onDraw={(stroke) => {
          setStrokes((prev) => [...prev, stroke]);
          sendStroke(stroke);
        }}
      />
    </div>
  );
}

const styles = {
  page: {
    width: "100vw",
    height: "100vh",
    position: "relative",
    fontFamily: "'Inter', sans-serif",
    background: "#f0f0f0",
    overflow: "hidden",
  },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "60px",
    background: "linear-gradient(90deg, #00c6ff, #0072ff, #7f00ff)", // ✅ only change
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  title: {
    color: "#ffffff", // ✅ only change
    fontSize: "20px",
    fontWeight: "600",
    margin: 0,
  },

  status: {
    position: "absolute",
    right: "20px",
    color: "#ffffff",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
  },
};