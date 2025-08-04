import logging

from sqlmodel import Session, select

from app.core.db import engine, init_db
from app import crud
from app.models import User, AuditLog

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init() -> None:
    with Session(engine) as session:
        init_db(session)
        
        # Create sample audit log data if no audit logs exist
        existing_audit_logs = session.exec(select(AuditLog).limit(1)).first()
        if not existing_audit_logs:
            logger.info("Creating sample audit log data...")
            # Get the first user (superuser) to create audit logs for
            user = session.exec(select(User).limit(1)).first()
            if user:
                sample_logs = crud.create_sample_audit_logs(session=session, user=user)
                logger.info(f"Created {len(sample_logs)} sample audit log entries")
            else:
                logger.warning("No users found to create sample audit logs for")
        else:
            logger.info("Sample audit log data already exists, skipping creation")


def main() -> None:
    logger.info("Creating initial data")
    init()
    logger.info("Initial data created")


if __name__ == "__main__":
    main()
