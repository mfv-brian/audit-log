import json
import asyncio
import logging
from typing import Dict, Set, Any
from datetime import datetime
from fastapi import Request
from app.models import AuditLogPublic

logger = logging.getLogger(__name__)


class SSEManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[asyncio.Queue]] = {
            "audit_logs": set()
        }
    
    async def connect(self, client_id: str, connection_type: str = "audit_logs") -> asyncio.Queue:
        """Create a new SSE connection for a client"""
        if connection_type not in self.active_connections:
            self.active_connections[connection_type] = set()
        
        # Create a queue for this client
        client_queue = asyncio.Queue()
        self.active_connections[connection_type].add(client_queue)
        
        logger.info(f"SSE client {client_id} connected. Total {connection_type} connections: {len(self.active_connections[connection_type])}")
        return client_queue
    
    def disconnect(self, client_id: str, client_queue: asyncio.Queue, connection_type: str = "audit_logs"):
        """Disconnect an SSE client"""
        if connection_type in self.active_connections:
            self.active_connections[connection_type].discard(client_queue)
            logger.info(f"SSE client {client_id} disconnected. Total {connection_type} connections: {len(self.active_connections[connection_type])}")
    
    async def send_message(self, message: dict, connection_type: str = "audit_logs"):
        """Send a message to all connected clients of a specific type"""
        if connection_type not in self.active_connections:
            return
        
        # Convert message to SSE format
        sse_message = f"data: {json.dumps(message)}\n\n"
        
        # Send to all connected clients
        disconnected_queues = set()
        
        for client_queue in self.active_connections[connection_type]:
            try:
                await client_queue.put(sse_message)
            except Exception as e:
                logger.error(f"Error sending SSE message to client: {e}")
                disconnected_queues.add(client_queue)
        
        # Clean up disconnected clients
        for client_queue in disconnected_queues:
            self.active_connections[connection_type].discard(client_queue)
    
    async def broadcast_audit_log(self, audit_log: AuditLogPublic):
        """Broadcast audit log to all connected SSE clients"""
        # Convert audit log to JSON-serializable format
        audit_log_data = {
            "id": str(audit_log.id),
            "user_id": str(audit_log.user_id),
            "action": audit_log.action,
            "resource_type": audit_log.resource_type,
            "resource_id": audit_log.resource_id,
            "severity": audit_log.severity,
            "timestamp": audit_log.timestamp.isoformat(),
            "user_agent": audit_log.user_agent,
            "ip_address": audit_log.ip_address,
            "before_state": audit_log.before_state,
            "after_state": audit_log.after_state,
            "custom_metadata": audit_log.custom_metadata,
            "tenant_id": audit_log.tenant_id,
            "session_id": audit_log.session_id,
        }
        
        message = {
            "type": "audit_log",
            "data": audit_log_data,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        await self.send_message(message, "audit_logs")
    
    def get_connection_count(self, connection_type: str = "audit_logs") -> int:
        """Get the number of active connections"""
        return len(self.active_connections.get(connection_type, set()))


# Global SSE manager instance
sse_manager = SSEManager() 