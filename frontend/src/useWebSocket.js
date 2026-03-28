import { useEffect, useRef, useState } from "react";

export default function useWebSocket(url, onMessage) {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setConnected(true);
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };

    ws.current.onclose = () => {
      setConnected(false);
    };

    return () => {
      ws.current?.close();
    };
  }, [url]);

  function sendStroke(stroke) {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "stroke",
        payload: stroke,
      }));
    }
  }

  function sendClear() {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "clear",
      }));
    }
  }

  return { connected, sendStroke, sendClear };
}