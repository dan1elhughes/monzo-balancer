ALTER TABLE access_checks ADD COLUMN pending_status TEXT CHECK (pending_status IN ('healthy', 'unhealthy'));
ALTER TABLE access_checks ADD COLUMN pending_detail TEXT;
ALTER TABLE access_checks ADD COLUMN pending_checked_at INTEGER;

UPDATE access_checks
SET pending_status=status, pending_detail=detail, pending_checked_at=checked_at
WHERE status != 'untested' AND status != notified_status;
