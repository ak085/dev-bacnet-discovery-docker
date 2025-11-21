# TimescaleDB Maintenance Guide

## Clear All Sensor Readings

### Quick Clear (Recommended)
Deletes all data while preserving the schema, indexes, and policies.

**Command:**
```bash
/tmp/clear_timescaledb.sh
```

**Or direct command (no confirmation):**
```bash
docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "TRUNCATE sensor_readings CASCADE;"
```

**What it does:**
- ✅ Deletes all sensor readings data
- ✅ Keeps hypertable schema intact
- ✅ Preserves indexes, compression policies, retention policies
- ✅ Takes ~1 second
- ✅ No service restart needed
- ✅ New data starts flowing immediately

**When to use:**
- Reconfiguring BACnet points
- Starting fresh with new Haystack tags
- Testing with different point configurations
- Clearing test data before production

---

## Verify Data Count

**Check current row count:**
```bash
docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "SELECT COUNT(*) FROM sensor_readings;"
```

**Check data by point:**
```bash
docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "
SELECT
  haystack_name,
  COUNT(*) as readings,
  MAX(time) as latest_reading
FROM sensor_readings
GROUP BY haystack_name
ORDER BY readings DESC;"
```

**Check data age:**
```bash
docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "
SELECT
  MIN(time) as oldest,
  MAX(time) as newest,
  COUNT(*) as total_readings
FROM sensor_readings;"
```

---

## Complete Database Reset

**Use when:** Changing schema, testing init scripts, or complete fresh start

**Commands:**
```bash
# Stop TimescaleDB
docker compose down timescaledb

# Delete volume (all data + schema)
docker volume rm bacpipes_timescaledb_data

# Restart (runs init scripts again)
docker compose up -d timescaledb telegraf grafana
```

**What it does:**
- ✅ Deletes everything (data + schema + policies)
- ✅ Recreates hypertable from scratch
- ✅ Runs `/timescaledb/init/01_init_hypertable.sql` again
- ⏱️ Takes ~30 seconds
- ⚠️ Requires service restart

---

## Troubleshooting

### "Too many readings" Issue
If Grafana shows readings increasing faster than expected:

**Check MQTT publishing rate:**
```bash
# Monitor MQTT messages in real-time
mosquitto_sub -h 10.0.60.2 -t "#" -v | grep presentValue
```

**Check worker polling cycle:**
```bash
docker compose logs bacnet-worker --tail=50 | grep "Poll cycle"
```

**Check telegraf ingestion:**
```bash
docker compose logs telegraf --tail=50 | grep "Stats:"
```

**Expected behavior:**
- 5 active points × 60s polling = ~5 readings/minute
- Total readings should increase by ~5 every minute

**If seeing 20+ readings/minute:**
- Worker might be doing batch publishing
- MQTT retained messages being replayed
- Multiple worker instances running
- Faster polling interval configured

---

## Monitoring TimescaleDB

**Disk usage:**
```bash
docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "
SELECT pg_size_pretty(pg_database_size('timescaledb')) as db_size;"
```

**Hypertable info:**
```bash
docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "
SELECT * FROM timescaledb_information.hypertables;"
```

**Compression stats:**
```bash
docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "
SELECT * FROM timescaledb_information.compression_settings;"
```

---

## Retention Policy

**Current setting:** 1 day (automatic deletion)

**Check retention policy:**
```bash
docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "
SELECT * FROM timescaledb_information.jobs WHERE proc_name = 'policy_retention';"
```

**Modify retention (example: 7 days):**
```sql
SELECT remove_retention_policy('sensor_readings');
SELECT add_retention_policy('sensor_readings', INTERVAL '7 days');
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Clear all data | `/tmp/clear_timescaledb.sh` |
| Count readings | `docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "SELECT COUNT(*) FROM sensor_readings;"` |
| Check latest data | `docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "SELECT * FROM sensor_readings ORDER BY time DESC LIMIT 5;"` |
| View by point | `docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c "SELECT haystack_name, COUNT(*) FROM sensor_readings GROUP BY haystack_name;"` |
