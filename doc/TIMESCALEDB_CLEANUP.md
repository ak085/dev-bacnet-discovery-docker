# TimescaleDB Cleanup Guide

## Overview

This guide documents the TimescaleDB cleanup script used to manage historical sensor data in the BacPipes project.

## Script Location

```bash
/home/ak101/BacPipes/timescaledb/cleanup_database.sh
```

## Purpose

The cleanup script helps manage the `sensor_readings` table in TimescaleDB by:
- Removing old or duplicate data
- Freeing up disk space
- Maintaining optimal database performance
- Providing statistics on data storage

## Usage

### 1. Show Statistics (Read-Only)

Display current database statistics without making any changes:

```bash
cd /home/ak101/BacPipes
./timescaledb/cleanup_database.sh --stats
```

**Output includes:**
- Total number of readings
- Readings per point (breakdown by haystack_name)
- Overall time range (oldest and newest readings)
- Database size (total database and table size)
- Minutes since last reading

### 2. Truncate All Data

**⚠️ WARNING: This deletes ALL data permanently**

```bash
./timescaledb/cleanup_database.sh --truncate
```

**Use cases:**
- Complete fresh start after fixing data collection issues
- Testing/development environment reset
- Removing corrupt or test data

**Example:**
```bash
$ ./timescaledb/cleanup_database.sh --truncate

=== TimescaleDB Statistics ===
Total readings: 3375
...
WARNING: This will delete ALL data from sensor_readings
Are you sure? (yes/no): yes
Truncating sensor_readings...
✅ All data deleted successfully
```

### 3. Keep Only Recent Hours

Keep only data from the last N hours, delete everything older:

```bash
./timescaledb/cleanup_database.sh --keep-hours N
```

**Examples:**

Keep last 24 hours:
```bash
./timescaledb/cleanup_database.sh --keep-hours 24
```

Keep last 1 hour:
```bash
./timescaledb/cleanup_database.sh --keep-hours 1
```

Keep last 30 minutes:
```bash
./timescaledb/cleanup_database.sh --keep-hours 0.5
```

**Use cases:**
- Remove duplicate data from before fixing MQTT reconnection issues
- Maintain rolling window of recent data
- Development/testing with fresh data

### 4. Delete Data Older Than N Days

Delete data older than N days, keep recent data:

```bash
./timescaledb/cleanup_database.sh --older-than-days N
```

**Examples:**

Delete data older than 7 days:
```bash
./timescaledb/cleanup_database.sh --older-than-days 7
```

Delete data older than 30 days:
```bash
./timescaledb/cleanup_database.sh --older-than-days 30
```

**Use cases:**
- Enforce retention policy (e.g., keep 30 days)
- Free up disk space
- Compliance with data retention requirements

## Script Source Code

```bash
#!/bin/bash
# TimescaleDB Cleanup Script
# Usage: ./cleanup_database.sh [--truncate|--keep-hours N|--older-than-days N]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="bacpipes-timescaledb"
DB_USER="anatoli"
DB_NAME="timescaledb"
TABLE_NAME="sensor_readings"

# Function to display usage
usage() {
    echo "TimescaleDB Cleanup Script"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  --truncate                Truncate all data from sensor_readings table"
    echo "  --keep-hours N            Keep only data from last N hours"
    echo "  --older-than-days N       Delete data older than N days"
    echo "  --stats                   Show statistics only (no deletion)"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --stats                          # Show current data statistics"
    echo "  $0 --truncate                       # Delete all data"
    echo "  $0 --keep-hours 24                  # Keep only last 24 hours"
    echo "  $0 --older-than-days 7              # Delete data older than 7 days"
    exit 1
}

# Function to execute SQL and get result
execute_sql() {
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "$1"
}

# Function to show statistics
show_stats() {
    echo -e "${GREEN}=== TimescaleDB Statistics ===${NC}"
    echo ""

    # Total rows
    total_rows=$(execute_sql "SELECT COUNT(*) FROM $TABLE_NAME;" | xargs)
    echo "Total readings: $total_rows"

    # Data by point
    echo ""
    echo "Readings per point:"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c \
        "SELECT haystack_name, COUNT(*) as count,
         MIN(time) as oldest,
         MAX(time) as newest,
         EXTRACT(EPOCH FROM (MAX(time) - MIN(time)))/3600 as hours_span
         FROM $TABLE_NAME
         GROUP BY haystack_name
         ORDER BY count DESC;"

    # Time range
    echo ""
    echo "Overall time range:"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c \
        "SELECT
         MIN(time) as oldest_reading,
         MAX(time) as newest_reading,
         EXTRACT(EPOCH FROM (MAX(time) - MIN(time)))/3600 as total_hours,
         EXTRACT(EPOCH FROM (NOW() - MAX(time)))/60 as minutes_since_last
         FROM $TABLE_NAME;"

    # Database size
    echo ""
    echo "Database size:"
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c \
        "SELECT
         pg_size_pretty(pg_database_size('$DB_NAME')) as database_size,
         pg_size_pretty(pg_total_relation_size('$TABLE_NAME')) as table_size;"
}

# Function to truncate all data
truncate_all() {
    echo -e "${YELLOW}WARNING: This will delete ALL data from $TABLE_NAME${NC}"
    read -p "Are you sure? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 0
    fi

    echo -e "${GREEN}Truncating $TABLE_NAME...${NC}"
    execute_sql "TRUNCATE $TABLE_NAME;"
    echo -e "${GREEN}✅ All data deleted successfully${NC}"
}

# Function to keep only recent data
keep_recent_hours() {
    hours=$1

    echo -e "${YELLOW}This will delete data older than $hours hours${NC}"

    # Show what will be deleted
    rows_to_delete=$(execute_sql "SELECT COUNT(*) FROM $TABLE_NAME WHERE time < NOW() - INTERVAL '$hours hours';" | xargs)
    echo "Rows to delete: $rows_to_delete"

    if [ "$rows_to_delete" -eq 0 ]; then
        echo "No data to delete."
        exit 0
    fi

    read -p "Continue? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 0
    fi

    echo -e "${GREEN}Deleting old data...${NC}"
    execute_sql "DELETE FROM $TABLE_NAME WHERE time < NOW() - INTERVAL '$hours hours';"
    echo -e "${GREEN}✅ Deleted $rows_to_delete rows${NC}"
}

# Function to delete data older than N days
delete_older_than() {
    days=$1

    echo -e "${YELLOW}This will delete data older than $days days${NC}"

    # Show what will be deleted
    rows_to_delete=$(execute_sql "SELECT COUNT(*) FROM $TABLE_NAME WHERE time < NOW() - INTERVAL '$days days';" | xargs)
    echo "Rows to delete: $rows_to_delete"

    if [ "$rows_to_delete" -eq 0 ]; then
        echo "No data to delete."
        exit 0
    fi

    read -p "Continue? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 0
    fi

    echo -e "${GREEN}Deleting old data...${NC}"
    execute_sql "DELETE FROM $TABLE_NAME WHERE time < NOW() - INTERVAL '$days days';"
    echo -e "${GREEN}✅ Deleted $rows_to_delete rows${NC}"
}

# Main logic
case "$1" in
    --stats)
        show_stats
        ;;
    --truncate)
        show_stats
        echo ""
        truncate_all
        echo ""
        show_stats
        ;;
    --keep-hours)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: --keep-hours requires a number${NC}"
            usage
        fi
        show_stats
        echo ""
        keep_recent_hours "$2"
        echo ""
        show_stats
        ;;
    --older-than-days)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: --older-than-days requires a number${NC}"
            usage
        fi
        show_stats
        echo ""
        delete_older_than "$2"
        echo ""
        show_stats
        ;;
    -h|--help)
        usage
        ;;
    *)
        echo -e "${RED}Error: Invalid option${NC}"
        echo ""
        usage
        ;;
esac
```

## Safety Features

1. **Confirmation Prompts**: All destructive operations require explicit "yes" confirmation
2. **Preview**: Shows statistics and row counts before deletion
3. **Before/After Stats**: Displays database state before and after cleanup
4. **Error Handling**: Script exits on errors (`set -e`)
5. **Color-Coded Output**: Visual cues for warnings and success messages

## Common Scenarios

### Scenario 1: After Fixing MQTT Reconnection Issue

**Problem**: Database has 3,000+ duplicate readings from reconnection loop

**Solution**: Truncate and start fresh
```bash
./timescaledb/cleanup_database.sh --truncate
```

### Scenario 2: Weekly Maintenance

**Problem**: Database growing over time, need to enforce 30-day retention

**Solution**: Delete data older than 30 days
```bash
./timescaledb/cleanup_database.sh --older-than-days 30
```

### Scenario 3: Testing New Polling Configuration

**Problem**: Need to test with fresh data after changing poll intervals

**Solution**: Keep only last hour
```bash
./timescaledb/cleanup_database.sh --keep-hours 1
```

### Scenario 4: Check Database Health

**Problem**: Want to verify data collection is working correctly

**Solution**: Show statistics
```bash
./timescaledb/cleanup_database.sh --stats
```

## Automated Cleanup (Cron Job)

To automatically clean old data, add a cron job:

```bash
# Edit crontab
crontab -e

# Add daily cleanup (keeps 30 days, runs at 2 AM)
0 2 * * * cd /home/ak101/BacPipes && echo "yes" | ./timescaledb/cleanup_database.sh --older-than-days 30
```

## Database Details

- **Container**: `bacpipes-timescaledb`
- **Database**: `timescaledb`
- **User**: `anatoli`
- **Table**: `sensor_readings`
- **Host Port**: 5435 (internal: 5432)

## Manual SQL Access

For advanced operations, connect directly to the database:

```bash
# Using Docker exec
docker exec -it bacpipes-timescaledb psql -U anatoli -d timescaledb

# From host (requires psql client)
psql -h localhost -p 5435 -U anatoli -d timescaledb
```

### Useful SQL Queries

**Count readings:**
```sql
SELECT COUNT(*) FROM sensor_readings;
```

**Check data age:**
```sql
SELECT
  MIN(time) as oldest,
  MAX(time) as newest,
  EXTRACT(EPOCH FROM (NOW() - MAX(time)))/60 as minutes_since_last
FROM sensor_readings;
```

**Readings per hour:**
```sql
SELECT
  date_trunc('hour', time) as hour,
  COUNT(*) as readings
FROM sensor_readings
GROUP BY hour
ORDER BY hour DESC
LIMIT 24;
```

**Data size:**
```sql
SELECT pg_size_pretty(pg_total_relation_size('sensor_readings'));
```

## Troubleshooting

### Issue: Script fails with "permission denied"

**Solution**: Make script executable
```bash
chmod +x /home/ak101/BacPipes/timescaledb/cleanup_database.sh
```

### Issue: Container not found

**Solution**: Check container is running
```bash
docker compose ps
docker compose up -d timescaledb
```

### Issue: Database connection error

**Solution**: Verify TimescaleDB is healthy
```bash
docker compose logs timescaledb
docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "SELECT 1;"
```

## Related Documentation

- **Main Documentation**: `/home/ak101/BacPipes/README.md`
- **MQTT Integration**: `/home/ak101/BacPipes/doc/MQTT_INTEGRATION.md`
- **Docker Compose**: `/home/ak101/BacPipes/docker-compose.yml`

## Changelog

### 2025-11-08
- Initial version created
- Supports truncate, keep-hours, older-than-days operations
- Added statistics display and safety confirmations
- Fixed MQTT reconnection issue causing 3,375 duplicate readings
- Successfully tested truncate operation (cleared all duplicates)

---

**Last Updated**: 2025-11-08
**Author**: BacPipes Development Team
