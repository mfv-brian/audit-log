import {
  Badge,
  Container,
  EmptyState,
  Flex,
  Heading,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FiActivity, FiSearch } from "react-icons/fi"
import { z } from "zod"

import { AuditLogsService } from "@/client"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"

const auditLogsSearchSchema = z.object({
  page: z.number().catch(1),
})

const PER_PAGE = 10

function getAuditLogsQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      AuditLogsService.readAuditLogs({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
      }),
    queryKey: ["audit-logs", { page }],
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
  return new Date(timestamp).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function AuditLogsTable() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { page } = Route.useSearch()

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getAuditLogsQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const setPage = (page: number) =>
    navigate({
      search: (prev: { [key: string]: string }) => ({ ...prev, page }),
    })

  const auditLogs = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

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

  if (auditLogs.length === 0) {
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
          {auditLogs?.map((log) => (
            <Table.Row key={log.id} opacity={isPlaceholderData ? 0.5 : 1}>
              <Table.Cell>
                <Badge colorScheme={getActionColor(log.action)} size="sm">
                  {log.action}
                </Badge>
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
      <AuditLogsTable />
    </Container>
  )
}
