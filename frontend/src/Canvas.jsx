import React, { useRef, useEffect } from "react";

export default function Canvas({ strokes, onDraw, color, tool, lineWidth }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const lastPos = useRef({ x: 0, y: 0 });

  // Core drawing logic for ALL tools
  const drawStroke = (ctx, s) => {
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (s.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = s.width * 2; // Make eraser slightly larger
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    } else if (s.tool === "highlighter") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.3; // Transparency for highlighter
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * 3;
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    } else if (s.tool === "rect") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    } else if (s.tool === "circle") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      const radius = Math.sqrt(Math.pow(s.x1 - s.x0, 2) + Math.pow(s.y1 - s.y0, 2));
      ctx.arc(s.x0, s.y0, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      // Normal Pen
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    }

    // Reset global properties so they don't bleed into the next stroke
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = "source-over";
  };

  // Redraw the entire canvas from the strokes array
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((s) => drawStroke(ctx, s));
  };

  // Handle incoming sockets or clear canvas
  useEffect(() => {
    redrawCanvas();
  }, [strokes]);

  // Handle window resizing
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    redrawCanvas();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      redrawCanvas();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function getPos(e) {
    return { x: e.clientX, y: e.clientY }; // No offset needed since canvas is fullscreen
  }

  function handleDown(e) {
    isDrawing.current = true;
    startPos.current = getPos(e);
    lastPos.current = getPos(e);
  }

  function handleMove(e) {
    if (!isDrawing.current) return;
    const current = getPos(e);
    const ctx = canvasRef.current.getContext("2d");

    // If drawing a shape, we need to show a preview
    if (tool === "rect" || tool === "circle") {
      redrawCanvas(); // Redraw past strokes
      drawStroke(ctx, { // Draw current preview
        tool, x0: startPos.current.x, y0: startPos.current.y,
        x1: current.x, y1: current.y, color, width: lineWidth
      });
    } else {
      // Continuous drawing for pen/highlighter/eraser
      const stroke = {
        tool, x0: lastPos.current.x, y0: lastPos.current.y,
        x1: current.x, y1: current.y, color, width: lineWidth
      };
      drawStroke(ctx, stroke); // Draw locally immediately
      onDraw(stroke);          // Send to socket
      lastPos.current = current;
    }
  }

  function handleUp(e) {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    // For shapes, we only commit the stroke when the mouse is released
    if (tool === "rect" || tool === "circle") {
      const current = getPos(e);
      const stroke = {
        tool, x0: startPos.current.x, y0: startPos.current.y,
        x1: current.x, y1: current.y, color, width: lineWidth
      };
      onDraw(stroke);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        background: "transparent",
        cursor: tool === "eraser" ? "cell" : "crosshair",
      }}
      onMouseDown={handleDown}
      onMouseMove={handleMove}
      onMouseUp={handleUp}
      onMouseLeave={handleUp}
    />
  );
}