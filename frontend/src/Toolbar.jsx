import React from "react";
import {
  Pencil,
  Highlighter,
  Eraser,
  Square,
  Circle,
  Trash2,
} from "lucide-react";

export default function Toolbar({
  setColor,
  color,
  clearCanvas,
  tool,
  setTool,
  lineWidth,
  setLineWidth,
}) {
  const tools = [
    { id: "pen", icon: <Pencil size={20} /> },
    { id: "highlighter", icon: <Highlighter size={20} /> },
    { id: "eraser", icon: <Eraser size={20} /> },
    { id: "rect", icon: <Square size={20} /> },
    { id: "circle", icon: <Circle size={20} /> },
  ];

  const thicknesses = [2, 5, 10];

  return (
    <div style={styles.toolbar}>
      {tools.map((t) => (
        <button
          key={t.id}
          style={{
            ...styles.button,
            background: tool === t.id ? "#e0e7ff" : "transparent",
            color: tool === t.id ? "#4f46e5" : "#4b5563",
          }}
          onClick={() => setTool(t.id)}
        >
          {t.icon}
        </button>
      ))}

      <div style={styles.divider} />

      <div style={styles.thicknessContainer}>
        {thicknesses.map((w) => (
          <button
            key={w}
            style={{
              ...styles.thicknessBtn,
              background: lineWidth === w ? "#4b5563" : "#d1d5db",
              width: w + 8,
              height: w + 8,
            }}
            onClick={() => setLineWidth(w)}
          />
        ))}
      </div>

      <div style={styles.divider} />

      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        style={styles.color}
      />

      <div style={styles.divider} />

      <button style={styles.clearBtn} onClick={clearCanvas}>
        <Trash2 size={20} />
      </button>
    </div>
  );
}

const styles = {
  toolbar: {
    position: "absolute",
    left: "20px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "50px",
    background: "white", // ✅ ORIGINAL
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "15px 0",
    gap: "10px",
    borderRadius: "12px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
    zIndex: 10,
  },

  button: {
    border: "none",
    borderRadius: "8px",
    width: "36px",
    height: "36px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    cursor: "pointer",
  },

  divider: {
    width: "30px",
    height: "1px",
    background: "#e5e7eb",
    margin: "5px 0",
  },

  thicknessContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    padding: "5px 0",
  },

  thicknessBtn: {
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
  },

  color: {
    width: "30px",
    height: "30px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    padding: 0,
  },

  clearBtn: {
    background: "transparent",
    border: "none",
    color: "#ef4444",
    cursor: "pointer",
    marginTop: "5px",
  },
};