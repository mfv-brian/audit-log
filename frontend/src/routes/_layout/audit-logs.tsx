import {
  Badge,
  Box,
  Button,
  Container,
  EmptyState,
  Flex,
  HStack,
  Heading,
  Input,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import {
  FiActivity,
  FiFilter,
  FiSearch,
  FiWifi,
  FiWifiOff,
  FiX,
} from "react-icons/fi"
import { z } from "zod"

import { type AuditLogPublic, AuditLogsService } from "@/client"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import { useSSE } from "@/hooks/useSSE"

const auditLogsSearchSchema = z.object({
  page: z.number().catch(1),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  severity: z.string().optional(),
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

const PER_PAGE = 10

function getAuditLogsQueryOptions({
  page,
  action,
  resourceType,
  severity,
  tenantId,
  userId,
  startDate,
  endDate,
}: {
  page: number
  action?: string
  resourceType?: string
  severity?: string
  tenantId?: string
  userId?: string
  startDate?: string
  endDate?: string
}) {
  return {
    skip: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
    action: action as any,
    resourceType,
    severity: severity as any,
    tenantId,
    startDate: startDate ? new Date(startDate).toISOString() : undefined,
    endDate: endDate ? new Date(endDate).toISOString() : undefined,
  }
}

export const Route = createFileRoute("/_layout/audit-logs")({
  component: AuditLogs,
  validateSearch: (search) => auditLogsSearchSchema.parse(search),
})

function getSeverityColor(severity: string) {
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

function getActionColor(action: string) {
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

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

// Filter options
const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "CREATE", label: "Create" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
  { value: "VIEW", label: "View" },
  { value: "LOGIN", label: "Login" },
  { value: "LOGOUT", label: "Logout" },
  { value: "EXPORT", label: "Export" },
  { value: "IMPORT", label: "Import" },
]

const SEVERITY_OPTIONS = [
  { value: "", label: "All Severities" },
  { value: "INFO", label: "Info" },
  { value: "WARNING", label: "Warning" },
  { value: "ERROR", label: "Error" },
  { value: "CRITICAL", label: "Critical" },
]

const RESOURCE_TYPE_OPTIONS = [
  { value: "", label: "All Resources" },
  { value: "user", label: "User" },
  { value: "item", label: "Item" },
  { value: "items", label: "Items" },
]

function AuditLogsFilters() {
  const navigate = useNavigate({ from: Route.fullPath })
  const search = Route.useSearch()
  const [showFilters, setShowFilters] = useState(false)

  const updateFilters = (updates: Partial<typeof search>) => {
    navigate({
      search: { ...search, ...updates, page: 1 }, // Reset to page 1 when filtering
    })
  }

  const clearFilters = () => {
    navigate({
      search: { page: 1 },
    })
  }

  const hasActiveFilters = useMemo(() => {
    return Object.keys(search).some(
      (key) =>
        key !== "page" &&
        search[key as keyof typeof search] &&
        search[key as keyof typeof search] !== "",
    )
  }, [search])

  return (
    <Box mb={6}>
      <Flex justify="space-between" align="center" mb={4}>
        <HStack>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FiFilter />
            Filters
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              colorScheme="red"
            >
              <FiX />
              Clear All
            </Button>
          )}
        </HStack>
        {hasActiveFilters && (
          <Text fontSize="sm" color="gray.600">
            {
              Object.keys(search).filter(
                (key) =>
                  key !== "page" &&
                  search[key as keyof typeof search] &&
                  search[key as keyof typeof search] !== "",
              ).length
            }{" "}
            active filters
          </Text>
        )}
      </Flex>

      {showFilters && (
        <Box
          p={4}
          border="1px"
          borderColor="gray.200"
          borderRadius="md"
          bg="gray.50"
        >
          <VStack gap={4} align="stretch">
            <HStack gap={4}>
              <Box flex={1}>
                <Text fontSize="sm" mb={2}>
                  Action Type
                </Text>
                <Input
                  size="sm"
                  placeholder="All Actions"
                  value={search.action || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateFilters({ action: e.target.value || undefined })
                  }
                  list="action-options"
                />
                <datalist id="action-options">
                  {ACTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
              </Box>

              <Box flex={1}>
                <Text fontSize="sm" mb={2}>
                  Resource Type
                </Text>
                <Input
                  size="sm"
                  placeholder="All Resources"
                  value={search.resourceType || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateFilters({ resourceType: e.target.value || undefined })
                  }
                  list="resource-options"
                />
                <datalist id="resource-options">
                  {RESOURCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
              </Box>

              <Box flex={1}>
                <Text fontSize="sm" mb={2}>
                  Severity
                </Text>
                <Input
                  size="sm"
                  placeholder="All Severities"
                  value={search.severity || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateFilters({ severity: e.target.value || undefined })
                  }
                  list="severity-options"
                />
                <datalist id="severity-options">
                  {SEVERITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
              </Box>
            </HStack>

            <HStack gap={4}>
              <Box flex={1}>
                <Text fontSize="sm" mb={2}>
                  Tenant ID
                </Text>
                <Input
                  size="sm"
                  placeholder="Enter tenant ID"
                  value={search.tenantId || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateFilters({ tenantId: e.target.value || undefined })
                  }
                />
              </Box>

              <Box flex={1}>
                <Text fontSize="sm" mb={2}>
                  User ID
                </Text>
                <Input
                  size="sm"
                  placeholder="Enter user ID"
                  value={search.userId || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateFilters({ userId: e.target.value || undefined })
                  }
                />
              </Box>
            </HStack>

            <HStack gap={4}>
              <Box flex={1}>
                <Text fontSize="sm" mb={2}>
                  Start Date
                </Text>
                <Input
                  size="sm"
                  type="datetime-local"
                  value={search.startDate || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateFilters({ startDate: e.target.value || undefined })
                  }
                />
              </Box>

              <Box flex={1}>
                <Text fontSize="sm" mb={2}>
                  End Date
                </Text>
                <Input
                  size="sm"
                  type="datetime-local"
                  value={search.endDate || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateFilters({ endDate: e.target.value || undefined })
                  }
                />
              </Box>
            </HStack>
          </VStack>
        </Box>
      )}
    </Box>
  )
}

function AuditLogsTable() {
  const navigate = useNavigate({ from: Route.fullPath })
  const search = Route.useSearch()
  
  // Single state for all audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLogPublic[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasInitialData, setHasInitialData] = useState(false)

  // Fetch audit logs from API
  const fetchAuditLogs = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const options = getAuditLogsQueryOptions(search)
      const response = await AuditLogsService.readAuditLogs(options)
      
      setAuditLogs(response.data || [])
      setTotalCount(response.count || 0)
      setHasInitialData(true)
    } catch (err) {
      console.error("Failed to fetch audit logs:", err)
      setError("Failed to load audit logs")
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch data when search params change
  useEffect(() => {
    fetchAuditLogs()
  }, [search.page, search.action, search.resourceType, search.severity, search.tenantId, search.userId, search.startDate, search.endDate])

  // SSE connection for real-time updates
  const { isConnected, connectionStatus } = useSSE({
    url: `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/v1/audit-logs/stream`,
    withAuth: true,
    minConnectionDelay: 2000,
    autoReconnect: true,
    reconnectInterval: 5000,
    maxReconnectAttempts: 3,
    onMessage: (message) => {
      if (message.type === "audit_log" && hasInitialData) {
        setAuditLogs((prevLogs) => {
          // Add new log at the beginning
          const newLogs = [message.data, ...prevLogs]
          
          // If we're on the first page, add the new log
          if (search.page === 1) {
            // Keep only the latest logs based on PER_PAGE
            return newLogs.slice(0, PER_PAGE)
          } else {
            // If we're not on the first page, just update the count
            // The new log will appear when user goes back to page 1
            return prevLogs
          }
        })
        
        // Update total count
        setTotalCount((prevCount) => prevCount + 1)
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

  const setPage = (page: number) =>
    navigate({
      search: { ...search, page },
    })

  // Get current page logs
  const currentPageLogs = auditLogs.slice(0, PER_PAGE)
  const count = totalCount

  if (isLoading) {
    return (
      <VStack gap={4} align="stretch">
        {Array.from({ length: 5 }).map((_, i) => (
          <Flex
            key={i}
            p={4}
            border="1px"
            borderColor="gray.200"
            borderRadius="md"
          >
            <VStack align="start" gap={2} flex={1}>
              <Flex gap={2}>
                <Badge size="sm" variant="outline" w="60px" h="20px" />
                <Badge size="sm" variant="outline" w="80px" h="20px" />
              </Flex>
              <Text fontSize="sm" color="gray.500" w="200px" h="16px" />
              <Text fontSize="xs" color="gray.400" w="150px" h="14px" />
            </VStack>
          </Flex>
        ))}
      </VStack>
    )
  }

  if (error) {
    return (
      <EmptyState.Root>
        <EmptyState.Content>
          <EmptyState.Indicator>
            <FiSearch />
          </EmptyState.Indicator>
          <VStack textAlign="center">
            <EmptyState.Title>Error loading audit logs</EmptyState.Title>
            <EmptyState.Description>
              {error}
            </EmptyState.Description>
            <Button onClick={fetchAuditLogs} colorScheme="blue">
              Retry
            </Button>
          </VStack>
        </EmptyState.Content>
      </EmptyState.Root>
    )
  }

  if (currentPageLogs.length === 0) {
    return (
      <EmptyState.Root>
        <EmptyState.Content>
          <EmptyState.Indicator>
            <FiSearch />
          </EmptyState.Indicator>
          <VStack textAlign="center">
            <EmptyState.Title>No audit logs found</EmptyState.Title>
            <EmptyState.Description>
              Audit logs will appear here when actions are performed
            </EmptyState.Description>
          </VStack>
        </EmptyState.Content>
      </EmptyState.Root>
    )
  }

  return (
    <>
      {/* Real-time Connection Status */}
      {hasInitialData && (
        <Box
          p={3}
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
                fontSize="sm"
                fontWeight="medium"
                color={isConnected ? "green.800" : "red.800"}
              >
                {isConnected
                  ? "Real-time updates active"
                  : "Real-time updates disconnected"}
              </Text>
              <Text fontSize="xs" color={isConnected ? "green.700" : "red.700"}>
                {isConnected
                  ? "New audit logs will appear automatically"
                  : "Not receiving real-time updates"}
              </Text>
            </Box>
            <Badge colorScheme={isConnected ? "green" : "red"} size="sm">
              {connectionStatus}
            </Badge>
          </Flex>
        </Box>
      )}

      {/* Main Audit Logs Table */}
      <Table.Root size={{ base: "sm", md: "md" }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="sm">Action</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">Resource</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">Severity</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">User & Tenant</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">Timestamp</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">IP Address</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {currentPageLogs?.map((log, index) => (
            <Table.Row 
              key={log.id} 
              bg={index === 0 && search.page === 1 && isConnected ? "blue.50" : undefined}
              borderLeft={index === 0 && search.page === 1 && isConnected ? "4px solid" : undefined}
              borderLeftColor={index === 0 && search.page === 1 && isConnected ? "blue.500" : undefined}
            >
              <Table.Cell>
                <HStack gap={2}>
                  <Badge colorScheme={getActionColor(log.action)} size="sm">
                    {log.action}
                  </Badge>
                  {index === 0 && search.page === 1 && isConnected && (
                    <Badge colorScheme="blue" size="sm">
                      NEW
                    </Badge>
                  )}
                </HStack>
              </Table.Cell>
              <Table.Cell>
                <VStack align="start" gap={1}>
                  <Text fontSize="sm" fontWeight="medium">
                    {log.resource_type}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    ID: {log.resource_id}
                  </Text>
                </VStack>
              </Table.Cell>
              <Table.Cell>
                <Badge
                  colorScheme={getSeverityColor(log.severity || "INFO")}
                  size="sm"
                >
                  {log.severity || "INFO"}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <VStack align="start" gap={1}>
                  <Text fontSize="sm" fontFamily="mono">
                    {log.user_id.slice(0, 8)}...
                  </Text>
                  <Text fontSize="xs" color="gray.500" fontFamily="mono">
                    {log.tenant_id || "N/A"}
                  </Text>
                </VStack>
              </Table.Cell>
              <Table.Cell>
                <Text fontSize="sm" color="gray.600">
                  {formatTimestamp(log.timestamp)}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text fontSize="sm" color="gray.500" fontFamily="mono">
                  {log.ip_address || "N/A"}
                </Text>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <Flex justifyContent="flex-end" mt={4}>
        <PaginationRoot
          count={count}
          pageSize={PER_PAGE}
          onPageChange={({ page }) => setPage(page)}
        >
          <Flex>
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </Flex>
        </PaginationRoot>
      </Flex>
    </>
  )
}

function AuditLogs() {
  return (
    <Container maxW="full">
      <Heading size="lg" pt={12} mb={6}>
        <Flex align="center" gap={3}>
          <FiActivity />
          Audit Logs
        </Flex>
      </Heading>
      <AuditLogsFilters />
      <AuditLogsTable />
    </Container>
  )
}
