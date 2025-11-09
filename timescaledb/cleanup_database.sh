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
