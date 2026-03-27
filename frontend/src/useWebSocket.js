import { useEffect, useRef, useState } from "react";

export default function useWebSocket(url, onStroke) {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    ws.current = new WebSocket(url);

    ws.current.onopen = () => setConnected(true);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "stroke") {
        onStroke(data.stroke);
      }
    };

    ws.current.onclose = () => setConnected(false);

    return () => ws.current.close();
  }, [url]);

  function sendStroke(stroke) {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "stroke", stroke }));
    }
  }

  return { connected, sendStroke };
}