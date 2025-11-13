# Remote Database Quick Start

## 🎯 Goal
Deploy central database on remote hardware, sync data from multiple BacPipes sites.

---

## Part 1: Remote Server (5 minutes)

### 1. Transfer Files

```bash
# From development machine
cd /home/ak101/BacPipes
git push origin development  # Push to gitea first

# On remote server
git clone http://10.0.10.2:30008/ak101/dev-bacnet-discovery-docker.git
cd dev-bacnet-discovery-docker
```

### 2. Configure

```bash
# Create .env file
cp .env.remote-db.example .env

# Edit (MUST change these!)
nano .env
```

**Required changes**:
```bash
REMOTE_DB_PASSWORD=your_strong_password_here
REMOTE_GRAFANA_PASSWORD=your_admin_password_here
REMOTE_API_KEY=$(openssl rand -base64 32)  # Generate strong key
```

### 3. Deploy

```bash
# Start services
docker compose -f docker-compose.remote-db.yml up -d

# Verify
curl http://localhost:8080/health
# Expected: {"status":"healthy","database":"connected"}
```

**Done!** Remote database is running.

---

## Part 2: Site Client (5 minutes per site)

### 1. Configure

```bash
# On each BacPipes site (LXC container)
cd /home/ak101/BacPipes/site-client

# Create config
cp ../.env.remote-db.example .env

# Edit
nano .env
```

**Required values**:
```bash
SITE_NAME=office_building_1  # Unique name
REMOTE_API_URL=http://10.0.x.x:8080  # Remote server IP
REMOTE_API_KEY=same-as-remote-server  # Copy from remote .env
```

### 2. Register Site

```bash
# Register on remote server
curl -X POST http://10.0.x.x:8080/api/sites/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "site_name": "office_building_1",
    "location": "Building address here",
    "timezone": "Asia/Kuala_Lumpur"
  }'
```

### 3. Install & Run

```bash
# Install dependencies
pip3 install requests psycopg2-binary

# Test run
python3 sync_to_remote.py

# Should see:
# INFO - Successfully sent XXX readings to remote
```

### 4. Run as Service

```bash
# Create systemd service
sudo nano /etc/systemd/system/bacpipes-sync.service
```

```ini
[Unit]
Description=BacPipes Remote Sync
After=network.target

[Service]
Type=simple
User=ak101
WorkingDirectory=/home/ak101/BacPipes/site-client
EnvironmentFile=/home/ak101/BacPipes/site-client/.env
ExecStart=/usr/bin/python3 sync_to_remote.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Start service
sudo systemctl enable bacpipes-sync
sudo systemctl start bacpipes-sync

# Check status
sudo systemctl status bacpipes-sync
```

**Done!** Site is syncing to remote database.

---

## Part 3: Verify (2 minutes)

### Check Site Stats

```bash
# On remote server
curl http://localhost:8080/api/sites/stats \
  -H "X-API-Key: your-api-key" | jq
```

**Expected**:
```json
{
  "success": true,
  "sites": [
    {
      "site_name": "office_building_1",
      "device_count": 2,
      "point_count": 50,
      "readings_last_hour": 600,
      "minutes_since_last_reading": 0.5
    }
  ]
}
```

### Check Grafana

```
URL: http://remote-server-ip:3003
Username: admin
Password: (from REMOTE_GRAFANA_PASSWORD)
```

1. Add datasource: PostgreSQL (remote-timescaledb:5432)
2. Create dashboard
3. Query: `SELECT * FROM site_statistics`

---

## Ports Used

| Service | Port | Purpose |
|---------|------|---------|
| Remote API | 8080 | Site data ingestion |
| Central Grafana | 3003 | Multi-site dashboards |
| Central TimescaleDB | 5436 | Direct DB access (optional) |

---

## Common Commands

```bash
# Remote server
docker compose -f docker-compose.remote-db.yml ps      # Status
docker compose -f docker-compose.remote-db.yml logs -f # Logs
docker compose -f docker-compose.remote-db.yml down    # Stop

# Site client
sudo systemctl status bacpipes-sync   # Status
sudo systemctl restart bacpipes-sync  # Restart
sudo journalctl -u bacpipes-sync -f   # Logs
```

---

## Troubleshooting

**Site can't reach remote**:
```bash
# Test connectivity
curl http://remote-server-ip:8080/health

# Check firewall on remote
sudo ufw allow 8080/tcp
```

**No data appearing**:
```bash
# Check site client logs
sudo journalctl -u bacpipes-sync -n 50

# Check if site is registered
curl http://remote-server-ip:8080/api/sites/stats \
  -H "X-API-Key: key"
```

**Database full**:
```bash
# Check size
docker exec -it bacpipes-remote-timescaledb \
  psql -U anatoli -d bacnet_central -c \
  "SELECT pg_size_pretty(pg_database_size('bacnet_central'))"

# Retention policy already set to 1 year
# Manually delete if needed:
# DELETE FROM sensor_readings WHERE time < NOW() - INTERVAL '6 months';
```

---

## Complete!

✅ Remote database deployed
✅ Site clients syncing
✅ Central Grafana ready for dashboards

**See full documentation**: `doc/REMOTE_DATABASE_SETUP.md`
