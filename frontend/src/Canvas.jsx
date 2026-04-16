import React, { useRef, useEffect } from "react";

export default function Canvas({ strokes, onDraw, color, tool, lineWidth }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const lastPos = useRef({ x: 0, y: 0 });
  const lastRenderedIndex = useRef(0);

  const redrawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (strokes.length === 0) {
      lastRenderedIndex.current = 0;
      return;
    }

    // ⚡ Path Batching: Groups contiguous segments to prevent overlapping joints in highlighters
    let currentBatch = [strokes[0]];

    const flushBatch = () => {
      if (currentBatch.length === 0) return;
      const first = currentBatch[0];

      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (first.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth = first.width * 2;
      } else if (first.tool === "highlighter") {
        ctx.globalCompositeOperation = "source-over";
        // Hex + "40" gives native 25% transparency without breaking destination-out
        ctx.strokeStyle = first.color.length === 7 ? first.color + "40" : first.color;
        ctx.lineWidth = first.width * 3;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = first.color;
        ctx.lineWidth = first.width;
      }

      if (first.tool === "rect" || first.tool === "circle") {
        currentBatch.forEach((s) => {
          if (s.tool === "rect") {
            ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
          } else if (s.tool === "circle") {
            const radius = Math.sqrt(Math.pow(s.x1 - s.x0, 2) + Math.pow(s.y1 - s.y0, 2));
            ctx.arc(s.x0, s.y0, radius, 0, 2 * Math.PI);
            ctx.stroke();
          }
        });
      } else {
        ctx.moveTo(first.x0, first.y0);
        currentBatch.forEach((s) => {
          if (s.x0 !== lastX || s.y0 !== lastY) {
            ctx.moveTo(s.x0, s.y0);
          }
          ctx.lineTo(s.x1, s.y1);
          var lastX = s.x1;
          var lastY = s.y1;
        });
        ctx.stroke();
      }
      currentBatch = [];
    };

    for (let i = 1; i < strokes.length; i++) {
      const s = strokes[i];
      const prev = currentBatch[0];
      if (s.tool === prev.tool && s.color === prev.color && s.width === prev.width) {
        currentBatch.push(s);
      } else {
        flushBatch();
        currentBatch.push(s);
      }
    }
    flushBatch();

    lastRenderedIndex.current = strokes.length;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    redrawAll();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      redrawAll();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    redrawAll();
  }, [strokes]);

  function getPos(e) {
    if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function handleDown(e) {
    isDrawing.current = true;
    const pos = getPos(e);
    startPos.current = pos;
    lastPos.current = pos;
  }

  function handleMove(e) {
    if (!isDrawing.current) return;
    const current = getPos(e);

    const stroke = {
      tool, color, width: lineWidth,
      x0: tool === "rect" || tool === "circle" ? startPos.current.x : lastPos.current.x,
      y0: tool === "rect" || tool === "circle" ? startPos.current.y : lastPos.current.y,
      x1: current.x, y1: current.y
    };

    if (tool !== "rect" && tool !== "circle") {
      onDraw(stroke); 
      lastPos.current = current;
    } else {
      redrawAll();
      const ctx = canvasRef.current.getContext("2d");
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (tool === "rect") {
        ctx.strokeRect(stroke.x0, stroke.y0, stroke.x1 - stroke.x0, stroke.y1 - stroke.y0);
      } else {
        const radius = Math.sqrt(Math.pow(stroke.x1 - stroke.x0, 2) + Math.pow(stroke.y1 - stroke.y0, 2));
        ctx.arc(stroke.x0, stroke.y0, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
  }

  function handleUp(e) {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    
    if (tool === "rect" || tool === "circle") {
      const current = getPos(e);
      const stroke = {
        tool, color, width: lineWidth,
        x0: startPos.current.x, y0: startPos.current.y,
        x1: current.x, y1: current.y
      };
      onDraw(stroke);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0, left: 0,
        background: "transparent",
        cursor: tool === "eraser" ? "cell" : "crosshair",
        touchAction: "none"
      }}
      onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
      onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}
    />
  );
}