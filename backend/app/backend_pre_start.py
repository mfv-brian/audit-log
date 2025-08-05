import logging

from sqlalchemy import Engine
from sqlmodel import Session, select
from tenacity import after_log, before_log, retry, stop_after_attempt, wait_fixed

from app.core.db import engine
from app import crud
from app.models import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

max_tries = 60 * 5  # 5 minutes
wait_seconds = 1


@retry(
    stop=stop_after_attempt(max_tries),
    wait=wait_fixed(wait_seconds),
    before=before_log(logger, logging.INFO),
    after=after_log(logger, logging.WARN),
)
def init(db_engine: Engine) -> None:
    try:
        with Session(db_engine) as session:
            # Try to create session to check if DB is awake
            session.exec(select(1))
            
            # Create sample audit log data if no audit logs exist
            try:
                from app.models import AuditLog
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
                    # Clear existing audit logs and recreate with tenant_id
                    logger.info("Clearing existing audit logs to recreate with tenant_id...")
                    all_existing_logs = session.exec(select(AuditLog)).all()
                    for log in all_existing_logs:
                        session.delete(log)
                    session.commit()
                    logger.info(f"Deleted {len(all_existing_logs)} existing audit logs")
                    
                    # Create new audit logs with tenant_id
                    user = session.exec(select(User).limit(1)).first()
                    if user:
                        sample_logs = crud.create_sample_audit_logs(session=session, user=user)
                        logger.info(f"Created {len(sample_logs)} new sample audit log entries with tenant_id")
                    else:
                        logger.warning("No users found to create sample audit logs for")
            except Exception as e:
                logger.warning(f"Could not create sample audit log data: {e}")
                logger.info("This is normal if the audit log table doesn't exist yet")
                
    except Exception as e:
        logger.error(e)
        raise e


def main() -> None:
    logger.info("Initializing service")
    init(engine)
    logger.info("Service finished initializing")


if __name__ == "__main__":
    main()
