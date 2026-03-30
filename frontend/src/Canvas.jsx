import React, { useRef, useEffect } from "react";

export default function Canvas({ strokes, onDraw, color, tool, lineWidth }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const lastPos = useRef({ x: 0, y: 0 });
  const strokesRef = useRef(strokes);
  const localStrokes = useRef([]);

  useEffect(() => {
    strokesRef.current = strokes;
    if (strokes.length === 0) {
      localStrokes.current = [];
    }
  }, [strokes]);

  // ─── Drawing helpers ────────────────────────────────────────────────────────

  const drawStroke = (ctx, s) => {
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = "source-over";

    if (s.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = s.width * 2;
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    } else if (s.tool === "highlighter") {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    } else if (s.tool === "rect") {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    } else if (s.tool === "circle") {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      const radius = Math.sqrt(
        Math.pow(s.x1 - s.x0, 2) + Math.pow(s.y1 - s.y0, 2)
      );
      ctx.arc(s.x0, s.y0, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = "source-over";
  };

  const redrawAll = (canvasEl) => {
    const ctx = canvasEl.getContext("2d");
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const allStrokes = [...strokesRef.current, ...localStrokes.current];
    const nonHighlighter = allStrokes.filter((s) => s.tool !== "highlighter");
    const highlighterStrokes = allStrokes.filter((s) => s.tool === "highlighter");

    nonHighlighter.forEach((s) => drawStroke(ctx, s));

    const uniqueColors = [...new Set(highlighterStrokes.map((s) => s.color))];
    uniqueColors.forEach((color) => {
      const offscreen = document.createElement("canvas");
      offscreen.width = canvasEl.width;
      offscreen.height = canvasEl.height;
      const offCtx = offscreen.getContext("2d");

      highlighterStrokes
        .filter((s) => s.color === color)
        .forEach((s) => drawStroke(offCtx, s));

      ctx.globalAlpha = 0.3;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(offscreen, 0, 0);
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = "source-over";
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    redrawAll(canvas);
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      redrawAll(canvas);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ─── Pointer position helpers ───────────────────────────────────────────────

  // Works for both MouseEvent and Touch
  function getPosFromMouse(e) {
    return { x: e.clientX, y: e.clientY };
  }

  function getPosFromTouch(e) {
    const touch = e.touches[0] || e.changedTouches[0];
    return { x: touch.clientX, y: touch.clientY };
  }

  // ─── Core draw actions (shared by mouse + touch) ────────────────────────────

  function startDraw(pos) {
    isDrawing.current = true;
    startPos.current = pos;
    lastPos.current = pos;
  }

  function moveDraw(pos) {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (tool === "rect" || tool === "circle") {
      redrawAll(canvas);
      drawStroke(ctx, {
        tool,
        color,
        width: lineWidth,
        x0: startPos.current.x,
        y0: startPos.current.y,
        x1: pos.x,
        y1: pos.y,
      });
    } else {
      const stroke = {
        tool,
        color,
        width: lineWidth,
        x0: lastPos.current.x,
        y0: lastPos.current.y,
        x1: pos.x,
        y1: pos.y,
      };

      if (tool === "highlighter") {
        localStrokes.current.push(stroke);
        onDraw(stroke);
        lastPos.current = pos;
        redrawAll(canvas);
      } else {
        drawStroke(ctx, stroke);
        localStrokes.current.push(stroke);
        onDraw(stroke);
        lastPos.current = pos;
      }
    }
  }

  function endDraw(pos) {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (tool === "rect" || tool === "circle") {
      const stroke = {
        tool,
        color,
        width: lineWidth,
        x0: startPos.current.x,
        y0: startPos.current.y,
        x1: pos.x,
        y1: pos.y,
      };
      localStrokes.current.push(stroke);
      onDraw(stroke);
    }
  }

  // ─── Mouse handlers ─────────────────────────────────────────────────────────

  function handleMouseDown(e) { startDraw(getPosFromMouse(e)); }
  function handleMouseMove(e) { moveDraw(getPosFromMouse(e)); }
  function handleMouseUp(e)   { endDraw(getPosFromMouse(e)); }

  // ─── Touch handlers ─────────────────────────────────────────────────────────

  function handleTouchStart(e) {
    e.preventDefault(); // prevent scroll while drawing
    startDraw(getPosFromTouch(e));
  }

  function handleTouchMove(e) {
    e.preventDefault();
    moveDraw(getPosFromTouch(e));
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    endDraw(getPosFromTouch(e));
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        background: "white",
        cursor: tool === "eraser" ? "cell" : "crosshair",
        width: "100vw",
        height: "100vh",
        touchAction: "none", // prevent browser scroll/zoom interfering with touch draw
      }}
      // Mouse
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      // Touch
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />
  );
}