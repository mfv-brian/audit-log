import type { AuditLogPublic } from "@/client"
import { useSSE } from "@/hooks/useSSE"
import {
  Badge,
  Box,
  Flex,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react"
import React from "react"
import { useEffect, useState } from "react"
import { FiPause, FiPlay, FiRefreshCw, FiWifi, FiWifiOff } from "react-icons/fi"

interface RealTimeAuditLogsProps {
  maxLogs?: number
  showConnectionStatus?: boolean
}

export function RealTimeAuditLogs({
  maxLogs = 50,
  showConnectionStatus = true,
}: RealTimeAuditLogsProps) {
  const [logs, setLogs] = useState<AuditLogPublic[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const { isConnected, connectionStatus, lastMessage } = useSSE({
    url: `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/v1/audit-logs/stream`,
    withAuth: true, // Enable authentication
    minConnectionDelay: 2000, // 2 second minimum delay between connection attempts
    autoReconnect: true,
    reconnectInterval: 5000,
    maxReconnectAttempts: 3,
    onMessage: (message) => {
      if (message.type === "audit_log" && !isPaused) {
        setLogs((prevLogs) => {
          const newLogs = [message.data, ...prevLogs]
          // Keep only the latest maxLogs
          return newLogs.slice(0, maxLogs)
        })
        setLastUpdate(new Date())
      }
    },
    onConnect: () => {
      console.log("Connected to audit logs SSE stream")
    },
    onDisconnect: () => {
      console.log("Disconnected from audit logs SSE stream")
    },
    onError: (error) => {
      console.error("SSE error:", error)
    },
  })

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "INFO":
        return "blue"
      case "WARNING":
        return "orange"
      case "ERROR":
        return "red"
      case "CRITICAL":
        return "purple"
      default:
        return "gray"
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case "CREATE":
        return "green"
      case "UPDATE":
        return "blue"
      case "DELETE":
        return "red"
      case "VIEW":
        return "gray"
      case "LOGIN":
        return "teal"
      case "LOGOUT":
        return "orange"
      case "EXPORT":
        return "purple"
      case "IMPORT":
        return "cyan"
      default:
        return "gray"
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const togglePause = () => {
    setIsPaused(!isPaused)
  }

  const clearLogs = () => {
    setLogs([])
    setLastUpdate(null)
  }

  return (
    <Box>
      {/* Connection Status */}
      {showConnectionStatus && (
        <Box
          p={4}
          mb={4}
          borderRadius="md"
          bg={isConnected ? "green.50" : "red.50"}
          border="1px"
          borderColor={isConnected ? "green.200" : "red.200"}
        >
          <Flex align="center" gap={3}>
            {isConnected ? <FiWifi color="green" /> : <FiWifiOff color="red" />}
            <Box flex="1">
              <Text
                fontWeight="bold"
                color={isConnected ? "green.800" : "red.800"}
              >
                {isConnected ? "Connected" : "Disconnected"}
              </Text>
              <Text fontSize="sm" color={isConnected ? "green.700" : "red.700"}>
                {isConnected
                  ? "Receiving real-time audit logs via SSE"
                  : "Not connected to audit logs stream"}
              </Text>
            </Box>
            <HStack gap={2}>
              <Badge colorScheme={isConnected ? "green" : "red"}>
                {connectionStatus}
              </Badge>
            </HStack>
          </Flex>
        </Box>
      )}

      {/* Controls */}
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="lg" fontWeight="bold">
          Real-Time Audit Logs ({logs.length})
        </Text>
        <HStack gap={2}>
          <IconButton
            aria-label={isPaused ? "Resume" : "Pause"}
            size="sm"
            onClick={togglePause}
            colorScheme={isPaused ? "green" : "orange"}
          >
            {isPaused ? <FiPlay /> : <FiPause />}
          </IconButton>
          <IconButton
            aria-label="Clear logs"
            size="sm"
            onClick={clearLogs}
            colorScheme="gray"
          >
            <FiRefreshCw />
          </IconButton>
        </HStack>
      </Flex>

      {/* Last Update */}
      {lastUpdate && (
        <Text fontSize="sm" color="gray.500" mb={4}>
          Last update: {formatTimestamp(lastUpdate.toISOString())}
        </Text>
      )}

      {/* Logs List */}
      <VStack gap={2} align="stretch" maxH="600px" overflowY="auto">
        {logs.length === 0 ? (
          <Box p={4} textAlign="center" color="gray.500">
            {isConnected
              ? "Waiting for audit logs..."
              : "Not connected to audit logs stream"}
          </Box>
        ) : (
          logs.map((log, index) => (
            <Box
              key={`${log.id}-${index}`}
              p={3}
              border="1px"
              borderColor="gray.200"
              borderRadius="md"
              bg="white"
              _hover={{ bg: "gray.50" }}
              transition="background 0.2s"
            >
              <Flex justify="space-between" align="start" mb={2}>
                <HStack gap={2}>
                  <Badge colorScheme={getActionColor(log.action)} size="sm">
                    {log.action}
                  </Badge>
                  <Badge
                    colorScheme={getSeverityColor(log.severity || "INFO")}
                    size="sm"
                  >
                    {log.severity || "INFO"}
                  </Badge>
                </HStack>
                <Text fontSize="xs" color="gray.500">
                  {formatTimestamp(log.timestamp)}
                </Text>
              </Flex>

              <VStack align="start" gap={1}>
                <Text fontSize="sm" fontWeight="medium">
                  {log.resource_type}: {log.resource_id}
                </Text>
                <HStack gap={4} fontSize="xs" color="gray.600">
                  <Text>User: {log.user_id.slice(0, 8)}...</Text>
                  {log.tenant_id && <Text>Tenant: {log.tenant_id}</Text>}
                  {log.ip_address && <Text>IP: {log.ip_address}</Text>}
                </HStack>
              </VStack>
            </Box>
          ))
        )}
      </VStack>
    </Box>
  )
}
