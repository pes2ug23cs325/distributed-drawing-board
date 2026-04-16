import { useEffect, useRef, useState } from "react";

export default function useWebSocket(url, onMessage) {
  const ws = useRef(null);
  const onMessageRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    function connect() {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => setConnected(true);

      ws.current.onclose = () => {
        setConnected(false);
        setTimeout(connect, 500);
      };

      ws.current.onerror = () => ws.current.close();

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current(data);
        } catch {}
      };
    }

    connect();
    return () => ws.current?.close();
  }, [url]);

  const sendStroke = (data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      // Send immediately so rapid eraser movements aren't dropped
      ws.current.send(JSON.stringify(data));
    }
  };

  return { connected, sendStroke };
}