import React, { useEffect, useRef } from "react";

export default function App() {
  const canvasRef = useRef(null);
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:3000");

    ws.current.onmessage = (event) => {
      const { x, y } = JSON.parse(event.data);
      draw(x, y);
    };
  }, []);

  const draw = (x, y) => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillRect(x, y, 3, 3);
  };

  const handleMove = (e) => {
    if (e.buttons !== 1) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const data = { x, y };

    ws.current.send(JSON.stringify(data));
    draw(x, y);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>🖊 Distributed Drawing Board</h1>
      <canvas
        ref={canvasRef}
        width={800}
        height={500}
        style={{ border: "1px solid black" }}
        onMouseMove={handleMove}
      />
    </div>
  );
}