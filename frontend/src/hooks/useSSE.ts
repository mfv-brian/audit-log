import { useCallback, useEffect, useRef, useState } from "react"

interface SSEMessage {
  type: "audit_log" | "system" | "connection" | "heartbeat" | "error"
  data?: any
  message?: string
  timestamp: string
  user_id?: string
}

interface UseSSEOptions {
  url: string
  onMessage?: (message: SSEMessage) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
  autoReconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
  withAuth?: boolean
  minConnectionDelay?: number
}

export function useSSE({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  autoReconnect = true,
  reconnectInterval = 5000,
  maxReconnectAttempts = 5,
  withAuth = false,
  minConnectionDelay = 1000,
}: UseSSEOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("disconnected")
  const [lastMessage, setLastMessage] = useState<SSEMessage | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  // Use refs for stable references to prevent unnecessary re-renders
  const abortControllerRef = useRef<AbortController | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const isConnectingRef = useRef(false)
  const lastConnectionAttemptRef = useRef(0)
  
  // Store callbacks in refs to prevent dependency changes
  const onMessageRef = useRef(onMessage)
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)
  const onErrorRef = useRef(onError)

  // Update refs when callbacks change
  useEffect(() => {
    onMessageRef.current = onMessage
    onConnectRef.current = onConnect
    onDisconnectRef.current = onDisconnect
    onErrorRef.current = onError
  }, [onMessage, onConnect, onDisconnect, onError])

  const connect = useCallback(async () => {
    // Prevent multiple simultaneous connections
    if (isConnectingRef.current) {
      console.log("SSE: Connection already in progress, skipping...")
      return
    }

    // Add minimum delay between connection attempts
    const now = Date.now()
    const timeSinceLastAttempt = now - lastConnectionAttemptRef.current
    if (timeSinceLastAttempt < minConnectionDelay) {
      console.log(`SSE: Waiting ${minConnectionDelay - timeSinceLastAttempt}ms before next connection attempt...`)
      return
    }

    // Clean up any existing connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    isConnectingRef.current = true
    lastConnectionAttemptRef.current = now
    setConnectionStatus("connecting")

    try {
      console.log("SSE: Attempting to connect...")
      
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      }

      // Add authentication header if requested
      if (withAuth) {
        const token = localStorage.getItem("access_token")
        if (token) {
          headers.Authorization = `Bearer ${token}`
        } else {
          console.warn("SSE: No access token found for authenticated connection")
          throw new Error("No access token available")
        }
      }

      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      if (!response.body) {
        throw new Error("No response body")
      }

      console.log("SSE: Connection established successfully")
      setIsConnected(true)
      setConnectionStatus("connected")
      setReconnectAttempts(0)
      reconnectAttemptsRef.current = 0
      onConnectRef.current?.()

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            console.log("SSE: Stream ended")
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split("\n")

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6) // Remove "data: " prefix
              
              if (data.trim() === "") continue

              try {
                const message: SSEMessage = JSON.parse(data)
                setLastMessage(message)
                onMessageRef.current?.(message)
              } catch (error) {
                console.error("Failed to parse SSE message:", error)
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Connection was intentionally aborted
        console.log("SSE: Connection aborted")
        return
      }

      console.error("SSE: Connection error:", error)
      setConnectionStatus("error")
      setIsConnected(false)
      onErrorRef.current?.(error as Event)

      // Auto-reconnect logic with exponential backoff
      if (
        autoReconnect &&
        reconnectAttemptsRef.current < maxReconnectAttempts
      ) {
        reconnectAttemptsRef.current += 1
        setReconnectAttempts(reconnectAttemptsRef.current)

        const backoffDelay = Math.min(
          reconnectInterval * Math.pow(2, reconnectAttemptsRef.current - 1),
          30000 // Max 30 seconds
        )

        console.log(`SSE: Reconnecting in ${backoffDelay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`)

        reconnectTimeoutRef.current = setTimeout(() => {
          isConnectingRef.current = false // Reset connection lock
          connect()
        }, backoffDelay)
      } else {
        console.log("SSE: Max reconnection attempts reached")
        onDisconnectRef.current?.()
      }
    } finally {
      isConnectingRef.current = false
    }
  }, [url, autoReconnect, reconnectInterval, maxReconnectAttempts, withAuth, minConnectionDelay])

  const disconnect = useCallback(() => {
    console.log("SSE: Disconnecting...")
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    isConnectingRef.current = false
    setIsConnected(false)
    setConnectionStatus("disconnected")
    setReconnectAttempts(0)
    reconnectAttemptsRef.current = 0
  }, [])

  // Only connect once on mount, not on every render
  useEffect(() => {
    // Add a small delay before initial connection to prevent rapid connect/disconnect
    const initialConnectionTimeout = setTimeout(() => {
      connect()
    }, 500)

    return () => {
      clearTimeout(initialConnectionTimeout)
      disconnect()
    }
  }, []) // Empty dependency array - only run on mount/unmount

  return {
    isConnected,
    connectionStatus,
    lastMessage,
    reconnectAttempts,
    connect,
    disconnect,
  }
}
