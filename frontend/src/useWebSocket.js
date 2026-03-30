import { useEffect, useRef, useState } from "react";

export default function useWebSocket(url, onMessage) {
  const ws = useRef(null);
  const onMessageRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);
  const [leader, setLeader] = useState("unknown");

  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    function connect() {
      ws.current = new WebSocket(url);
      ws.current.onopen = () => setConnected(true);
      ws.current.onclose = () => {
        setConnected(false);
        setTimeout(connect, 1000);
      };
      ws.current.onerror = () => ws.current.close();
      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current(data);
        } catch (e) {}
      };
    }
    connect();
    return () => ws.current?.close();
  }, [url]);

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

  const sendStroke = (data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  };

  return { connected, sendStroke, leader };
}