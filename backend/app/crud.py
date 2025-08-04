import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.security import get_password_hash, verify_password
from app.models import Item, ItemCreate, User, UserCreate, UserUpdate, AuditLog, AuditLogCreate, AuditAction, AuditSeverity


def create_user(*, session: Session, user_create: UserCreate) -> User:
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    session_user = session.exec(statement).first()
    return session_user


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    db_user = get_user_by_email(session=session, email=email)
    if not db_user:
        return None
    if not verify_password(password, db_user.hashed_password):
        return None
    return db_user


def create_item(*, session: Session, item_in: ItemCreate, owner_id: uuid.UUID) -> Item:
    db_item = Item.model_validate(item_in, update={"owner_id": owner_id})
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item


def create_audit_log(*, session: Session, audit_log_in: AuditLogCreate, user_id: uuid.UUID) -> AuditLog:
    """Create a new audit log entry."""
    db_audit_log = AuditLog.model_validate(audit_log_in, update={"user_id": user_id})
    session.add(db_audit_log)
    session.commit()
    session.refresh(db_audit_log)
    return db_audit_log


def create_sample_audit_logs(*, session: Session, user: User) -> list[AuditLog]:
    """Create sample audit log entries for demonstration purposes."""
    sample_logs = []
    
    # Sample login audit log
    login_log = AuditLog(
        user_id=user.id,
        action=AuditAction.LOGIN,
        resource_type="user",
        resource_id=str(user.id),
        severity=AuditSeverity.INFO,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ip_address="192.168.1.100",
        custom_metadata='{"login_method": "password", "success": true}'
    )
    sample_logs.append(login_log)
    
    # Sample item creation audit log
    item_create_log = AuditLog(
        user_id=user.id,
        action=AuditAction.CREATE,
        resource_type="item",
        resource_id="sample-item-001",
        severity=AuditSeverity.INFO,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ip_address="192.168.1.100",
        before_state=None,
        after_state='{"title": "Sample Item", "description": "This is a sample item for testing"}',
        custom_metadata='{"item_type": "document", "category": "general"}'
    )
    sample_logs.append(item_create_log)
    
    # Sample item update audit log
    item_update_log = AuditLog(
        user_id=user.id,
        action=AuditAction.UPDATE,
        resource_type="item",
        resource_id="sample-item-001",
        severity=AuditSeverity.INFO,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ip_address="192.168.1.100",
        before_state='{"title": "Sample Item", "description": "This is a sample item for testing"}',
        after_state='{"title": "Updated Sample Item", "description": "This is an updated sample item"}',
        custom_metadata='{"update_reason": "content improvement"}'
    )
    sample_logs.append(item_update_log)
    
    # Sample export audit log
    export_log = AuditLog(
        user_id=user.id,
        action=AuditAction.EXPORT,
        resource_type="items",
        resource_id="bulk-export-001",
        severity=AuditSeverity.INFO,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ip_address="192.168.1.100",
        custom_metadata='{"export_format": "csv", "record_count": 25, "filters": {"status": "active"}}'
    )
    sample_logs.append(export_log)
    
    # Sample warning audit log
    warning_log = AuditLog(
        user_id=user.id,
        action=AuditAction.VIEW,
        resource_type="user",
        resource_id="other-user-123",
        severity=AuditSeverity.WARNING,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ip_address="192.168.1.100",
        custom_metadata='{"warning_reason": "accessing_other_user_profile", "permission_level": "read_only"}'
    )
    sample_logs.append(warning_log)
    
    # Add all sample logs to session
    for log in sample_logs:
        session.add(log)
    
    session.commit()
    
    # Refresh all logs to get their IDs
    for log in sample_logs:
        session.refresh(log)
    
    return sample_logs
