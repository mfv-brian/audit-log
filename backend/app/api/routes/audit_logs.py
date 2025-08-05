import uuid
import json
import asyncio
from typing import Any, AsyncGenerator
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.sse import sse_manager
from app.models import (
    AuditLog, 
    AuditLogCreate, 
    AuditLogPublic, 
    AuditLogsPublic, 
    AuditLogUpdate, 
    Message,
    AuditAction,
    AuditSeverity
)

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("/", response_model=AuditLogsPublic)
def read_audit_logs(
    session: SessionDep, 
    current_user: CurrentUser, 
    skip: int = 0, 
    limit: int = 100,
    action: AuditAction | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    severity: AuditSeverity | None = None,
    tenant_id: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> Any:
    """
    Retrieve audit logs with optional filtering.
    """
    # Build base query
    query = select(AuditLog)
    
    # Apply filters
    if action:
        query = query.where(AuditLog.action == action)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
    if resource_id:
        query = query.where(AuditLog.resource_id == resource_id)
    if severity:
        query = query.where(AuditLog.severity == severity)
    if tenant_id:
        query = query.where(AuditLog.tenant_id == tenant_id)
    if start_date:
        query = query.where(AuditLog.timestamp >= start_date)
    if end_date:
        query = query.where(AuditLog.timestamp <= end_date)

    # Apply user permissions
    if current_user.is_superuser:
        # Superusers can see all audit logs
        pass
    else:
        # Regular users can only see their own audit logs
        query = query.where(AuditLog.user_id == current_user.id)

    # Get count
    count_query = select(func.count()).select_from(query.subquery())
    count = session.exec(count_query).one()

    # Apply pagination
    query = query.offset(skip).limit(limit).order_by(AuditLog.timestamp.desc())
    audit_logs = session.exec(query).all()

    return AuditLogsPublic(data=audit_logs, count=count)


@router.get("/stream")
async def stream_audit_logs(
    current_user: CurrentUser,
    session: SessionDep,
) -> StreamingResponse:
    """
    Server-Sent Events endpoint for real-time audit logs.
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        # Create a unique client ID
        client_id = f"{current_user.id}_{id(current_user)}"
        
        # Connect to SSE manager
        client_queue = await sse_manager.connect(client_id, "audit_logs")
        
        try:
            # Send initial connection message
            yield f"data: {json.dumps({'type': 'connection', 'message': 'Connected to audit logs stream', 'timestamp': datetime.utcnow().isoformat()})}\n\n"
            
            # Keep connection alive and forward messages from queue
            while True:
                try:
                    # Wait for messages from the queue with a timeout for heartbeats
                    message = await asyncio.wait_for(client_queue.get(), timeout=30.0)
                    yield message
                except asyncio.TimeoutError:
                    # Send heartbeat if no messages received
                    yield f"data: {json.dumps({'type': 'heartbeat', 'timestamp': datetime.utcnow().isoformat()})}\n\n"
                
        except asyncio.CancelledError:
            # Client disconnected
            pass
        finally:
            # Disconnect from SSE manager
            sse_manager.disconnect(client_id, client_queue, "audit_logs")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
        }
    )


@router.get("/{id}", response_model=AuditLogPublic)
def read_audit_log(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get audit log by ID.
    """
    audit_log = session.get(AuditLog, id)
    if not audit_log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    # Check permissions
    if not current_user.is_superuser and (audit_log.user_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    return audit_log


@router.post("/", response_model=AuditLogPublic)
async def create_audit_log(
    *, 
    session: SessionDep, 
    current_user: CurrentUser, 
    request: Request,
    audit_log_in: AuditLogCreate
) -> Any:
    """
    Create new audit log entry.
    """
    # Get client IP and user agent
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # Create audit log with additional context
    audit_log_data = audit_log_in.model_dump()
    audit_log_data.update({
        "user_id": current_user.id,
        "ip_address": client_ip,
        "user_agent": user_agent,
    })
    
    audit_log = AuditLog.model_validate(audit_log_data)
    session.add(audit_log)
    session.commit()
    session.refresh(audit_log)
    
    # Convert to public model for SSE broadcast
    audit_log_public = AuditLogPublic.model_validate(audit_log)
    
    # Broadcast via SSE (fire and forget)
    try:
        await sse_manager.broadcast_audit_log(audit_log_public)
    except Exception as e:
        # Log error but don't fail the audit log creation
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to broadcast audit log via SSE: {e}")
    
    return audit_log


@router.put("/{id}", response_model=AuditLogPublic)
def update_audit_log(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    audit_log_in: AuditLogUpdate,
) -> Any:
    """
    Update an audit log entry.
    """
    audit_log = session.get(AuditLog, id)
    if not audit_log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    # Check permissions
    if not current_user.is_superuser and (audit_log.user_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    update_dict = audit_log_in.model_dump(exclude_unset=True)
    audit_log.sqlmodel_update(update_dict)
    session.add(audit_log)
    session.commit()
    session.refresh(audit_log)
    return audit_log


@router.delete("/{id}")
def delete_audit_log(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """
    Delete an audit log entry.
    """
    audit_log = session.get(AuditLog, id)
    if not audit_log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    # Check permissions
    if not current_user.is_superuser and (audit_log.user_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    session.delete(audit_log)
    session.commit()
    return Message(message="Audit log deleted successfully")


@router.get("/stats/summary", response_model=dict)
def get_audit_stats(
    session: SessionDep,
    current_user: CurrentUser,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    tenant_id: str | None = None,
) -> Any:
    """
    Get audit log statistics summary.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only superusers can access audit statistics")
    
    # Build base query
    query = select(AuditLog)
    
    # Apply filters
    if start_date:
        query = query.where(AuditLog.timestamp >= start_date)
    if end_date:
        query = query.where(AuditLog.timestamp <= end_date)
    if tenant_id:
        query = query.where(AuditLog.tenant_id == tenant_id)
    
    # Get total count
    total_count = session.exec(select(func.count()).select_from(query.subquery())).one()
    
    # Get action distribution
    action_stats = {}
    for action in AuditAction:
        action_query = query.where(AuditLog.action == action)
        count = session.exec(select(func.count()).select_from(action_query.subquery())).one()
        action_stats[action.value] = count
    
    # Get severity distribution
    severity_stats = {}
    for severity in AuditSeverity:
        severity_query = query.where(AuditLog.severity == severity)
        count = session.exec(select(func.count()).select_from(severity_query.subquery())).one()
        severity_stats[severity.value] = count
    
    # Get resource type distribution
    resource_type_query = select(AuditLog.resource_type, func.count(AuditLog.id)).select_from(query.subquery()).group_by(AuditLog.resource_type)
    resource_type_stats = dict(session.exec(resource_type_query).all())
    
    return {
        "total_count": total_count,
        "action_distribution": action_stats,
        "severity_distribution": severity_stats,
        "resource_type_distribution": resource_type_stats,
    }


@router.post("/log-action", response_model=AuditLogPublic)
def log_action(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    request: Request,
    action: AuditAction,
    resource_type: str,
    resource_id: str,
    severity: AuditSeverity = AuditSeverity.INFO,
    before_state: dict | None = None,
    after_state: dict | None = None,
    custom_metadata: dict | None = None,
    tenant_id: str | None = None,
) -> Any:
    """
    Convenience endpoint to quickly log an action.
    """
    # Get client IP and user agent
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # Serialize dict objects to JSON strings
    before_state_json = json.dumps(before_state) if before_state else None
    after_state_json = json.dumps(after_state) if after_state else None
    custom_metadata_json = json.dumps(custom_metadata) if custom_metadata else None
    
    # Create audit log entry
    audit_log = AuditLog(
        user_id=current_user.id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        severity=severity,
        before_state=before_state_json,
        after_state=after_state_json,
        custom_metadata=custom_metadata_json,
        tenant_id=tenant_id,
        ip_address=client_ip,
        user_agent=user_agent,
    )
    
    session.add(audit_log)
    session.commit()
    session.refresh(audit_log)
    return audit_log