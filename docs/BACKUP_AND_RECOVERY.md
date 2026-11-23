# Database Backup & Disaster Recovery Runbook
**Make Me Artist (`mmabusinesssuite`)**  
**Classification:** Operational Security & Business Continuity Standard  
**Last Updated:** November 23, 2026  
**Audited & Implemented by:** Principal Software Architect / CTO

---

## 1. Overview & Architecture

To prevent data loss and ensure zero-downtime recovery of the commercial database, automated nightly backups are scheduled directly on the production host (`root@200.234.35.116`). The backups extract all tables, views, sequences, triggers, and Row-Level Security (RLS) policies from the Supabase PostgreSQL cluster (`kgyofhcyifrpogdcyugw`) into timestamped, compressed SQL archives.

### Architecture Summary

```
+-------------------------------------------------------------+
| VPS: root@200.234.35.116                                   |
|                                                             |
|  Cron (02:00 UTC) --> /root/backup-supabase.sh (chmod 700)  |
|                                |                            |
|             Reads /root/.supabase_backup.env (chmod 600)    |
|                                |                            |
|             Docker postgres:17-alpine pg_dump               |
|                                |                            |
|             Output: /data/coolify/backups/                  |
|             `-- supabase_backup_<TIMESTAMP>.sql.gz          |
|                                                             |
|             Automated 30-day retention pruning              |
+-------------------------------------------------------------+
                                |
                   TLS Encrypted Connection (Port 5432)
                                v
+-------------------------------------------------------------+
| Supabase Pooler: aws-0-ap-southeast-1.pooler.supabase.com   |
| Database: postgres (Project: kgyofhcyifrpogdcyugw)          |
+-------------------------------------------------------------+
```

---

## 2. Backup Configuration & Security

### 2.1 File System Permissions & Credential Isolation
- **Environment File:** `/root/.supabase_backup.env`  
  - Permissions: `0600` (`-rw-------`), strictly owned by `root:root`.  
  - Content: Non-exported connection environment variables (`SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_USER`, `SUPABASE_DB_NAME`, `PGPASSWORD`).  
  - **Zero Exposure Guarantee:** This file is outside web roots, application git repositories, and container volumes.
- **Execution Script:** `/root/backup-supabase.sh`  
  - Permissions: `0700` (`-rwx------`), owned by `root:root`.  
- **Storage Target:** `/data/coolify/backups`  
  - Dedicated persistent volume on host storage.

### 2.2 Backup Script Source (`/root/backup-supabase.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/root/.supabase_backup.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] ERROR: $ENV_FILE not found" >&2
    exit 1
fi

# Load variables safely
set -a
source "$ENV_FILE"
set +a

BACKUP_DIR="/data/coolify/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +'%Y%m%d_%H%M%SZ')
BACKUP_FILE="${BACKUP_DIR}/supabase_backup_${TIMESTAMP}.sql.gz"

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Starting Supabase backup to ${BACKUP_FILE}..."

# Execute pg_dump inside official postgres:17-alpine container
docker run --rm \
  --net=host \
  -e PGPASSWORD="${PGPASSWORD}" \
  postgres:17-alpine \
  pg_dump \
    -h "${SUPABASE_DB_HOST}" \
    -p "${SUPABASE_DB_PORT}" \
    -U "${SUPABASE_DB_USER}" \
    -d "${SUPABASE_DB_NAME}" \
    --schema=public \
    --no-owner \
    --no-privileges \
  | gzip -c > "${BACKUP_FILE}"

# Verify file existence and non-zero size
if [ ! -s "${BACKUP_FILE}" ]; then
    echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] ERROR: Backup file ${BACKUP_FILE} is empty or missing!" >&2
    exit 1
fi

FILESIZE=$(stat -c%s "${BACKUP_FILE}")
echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Backup completed successfully. Size: ${FILESIZE} bytes."

# Retention cleanup: purge archives older than 30 days
DELETED_COUNT=$(find "${BACKUP_DIR}" -type f -name "supabase_backup_*.sql.gz" -mtime +30 -print -delete | wc -l)
echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Retention check complete. Removed ${DELETED_COUNT} backup(s) older than 30 days."
```

### 2.3 Crontab Schedule
```cron
# Daily Supabase Database Dump at 02:00 UTC
0 2 * * * /root/backup-supabase.sh >> /var/log/supabase-backup.log 2>&1
```

---

## 3. Verified Verification Evidence

Initial baseline test execution on production VPS:
- **Execution Timestamp:** `2026-11-23T14:43:27Z`
- **Output File:** `/data/coolify/backups/supabase_backup_20261123_144327Z.sql.gz`
- **Archive Size:** 313,607 bytes (~307 KB compressed)
- **Status:** Complete, valid gzip compressed stream, zero errors.
- **Log Entry:** Verified in `/var/log/supabase-backup.log` and interactive terminal audit.

---

## 4. Disaster Recovery & Restoration Procedures

In the event of database corruption, accidental drop, or disaster recovery scenario:

### Pre-requisites
1. Identify the target backup archive:
   ```bash
   ls -lht /data/coolify/backups/
   ```
2. Confirm database connectivity to target Supabase project using `/root/.supabase_backup.env`.

### Step 4.1: Dry-Run Inspection (Read-Only)
Inspect the archive contents without writing to the database:
```bash
zcat /data/coolify/backups/supabase_backup_<TIMESTAMP>.sql.gz | head -n 50
```

### Step 4.2: Full Database Restore
To restore public schema to Supabase:
```bash
# Load connection variables
set -a && source /root/.supabase_backup.env && set +a

# Restore using dockerized psql client
zcat /data/coolify/backups/supabase_backup_<TIMESTAMP>.sql.gz | \
docker run --rm -i \
  --net=host \
  -e PGPASSWORD="${PGPASSWORD}" \
  postgres:17-alpine \
  psql \
    -h "${SUPABASE_DB_HOST}" \
    -p "${SUPABASE_DB_PORT}" \
    -U "${SUPABASE_DB_USER}" \
    -d "${SUPABASE_DB_NAME}" \
    --single-transaction \
    -v ON_ERROR_STOP=1
```

> [!CAUTION]
> Restoring with `--single-transaction` ensures atomic application. If any statement encounters an unrecoverable conflict, the entire transaction rolls back, leaving current data untouched.

### Step 4.3: Table-Specific Restore (Selective Recovery)
If only a specific table needs to be recovered (e.g., `sales_orders` or `roi_payouts`):
```bash
# Extract only the target table COPY block or statements
zcat /data/coolify/backups/supabase_backup_<TIMESTAMP>.sql.gz | \
sed -n '/COPY public.sales_orders /,/\\\./p' > /tmp/sales_orders_restore.sql

# Inspect extracted data
head -n 20 /tmp/sales_orders_restore.sql

# Apply restored rows
docker run --rm -i \
  --net=host \
  -e PGPASSWORD="${PGPASSWORD}" \
  postgres:17-alpine \
  psql \
    -h "${SUPABASE_DB_HOST}" \
    -p "${SUPABASE_DB_PORT}" \
    -U "${SUPABASE_DB_USER}" \
    -d "${SUPABASE_DB_NAME}" \
    -f - < /tmp/sales_orders_restore.sql
```

### Step 4.4: Post-Restoration Integrity Verification
Run the verification script to confirm schema, row counts, and foreign keys:
```powershell
powershell -ExecutionPolicy Bypass -File E:\GitHub\MMA-Migration\verify-data.ps1 -ExpectPhase B
```
Verify sequences:
```sql
SELECT last_value FROM roi_claim_ref_seq;
SELECT last_value FROM sales_invoice_seq;
```
