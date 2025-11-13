# BacPipes Remote Database Setup Guide

## Overview

This guide explains how to set up a **central remote database** that aggregates data from multiple BacPipes site installations.

**Use cases**:
- Multi-site building portfolios
- Central monitoring dashboard for all locations
- Cross-site analytics and comparisons
- Centralized data storage and backup
- ML model training on aggregated data

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Site 1 (Office Building - LXC Container)           │
│  ┌─────────────────────────────────────────┐       │
│  │ BacPipes Local Stack                    │       │
│  │ - BACnet discovery & polling            │       │
│  │ - Local TimescaleDB storage             │       │
│  │ - Local Grafana dashboards              │       │
│  └─────────────────┬───────────────────────┘       │
│                    │                                │
│  ┌─────────────────▼───────────────────────┐       │
│  │ Site Client (sync_to_remote.py)         │       │
│  │ - Reads from local TimescaleDB          │       │
│  │ - Sends to remote API every 5 min       │       │
│  └─────────────────┬───────────────────────┘       │
└────────────────────┼─────────────────────────────────┘
                     │
                     ↓ HTTPS (API key auth)
┌─────────────────────────────────────────────────────┐
│  Central Server (Remote Hardware/Cloud)              │
│  ┌─────────────────────────────────────────┐       │
│  │ Remote Database Stack                   │       │
│  │ (docker-compose.remote-db.yml)          │       │
│  │                                         │       │
│  │ ┌─────────────────────────────────┐   │       │
│  │ │ Remote API (FastAPI)            │   │       │
│  │ │ - Accept data from sites        │   │       │
│  │ │ - API key authentication        │   │       │
│  │ │ - Port: 8080                    │   │       │
│  │ └──────────┬──────────────────────┘   │       │
│  │            ↓                           │       │
│  │ ┌─────────────────────────────────┐   │       │
│  │ │ Central TimescaleDB             │   │       │
│  │ │ - Stores all sites' data        │   │       │
│  │ │ - Continuous aggregates         │   │       │
│  │ │ - Port: 5436                    │   │       │
│  │ └──────────┬──────────────────────┘   │       │
│  │            ↓                           │       │
│  │ ┌─────────────────────────────────┐   │       │
│  │ │ Central Grafana                 │   │       │
│  │ │ - Multi-site dashboards         │   │       │
│  │ │ - Cross-site comparisons        │   │       │
│  │ │ - Port: 3003                    │   │       │
│  │ └─────────────────────────────────┘   │       │
│  └─────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
                     ↑
┌────────────────────┼─────────────────────────────────┐
│  Site 2 (Factory - LXC Container)                    │
│  [Same structure as Site 1]                          │
└──────────────────────────────────────────────────────┘
```

## Prerequisites

### For Central Server

**Hardware**:
- Linux server (Ubuntu 22.04 recommended)
- Minimum 4GB RAM (8GB+ for many sites)
- 50GB+ SSD storage (grows with data)
- Static IP or domain name

**Software**:
- Docker 24.0+
- Docker Compose 2.20+
- Open ports: 8080 (API), 3003 (Grafana), 5436 (optional DB access)

### For Site Clients

**Each BacPipes site needs**:
- Existing BacPipes installation (v0.6.2+)
- Python 3.10+ with pip
- Network access to remote server

---

## Part 1: Deploy Central Remote Database

### Step 1: Prepare Remote Server

```bash
# SSH to remote server
ssh user@remote-server-ip

# Create project directory
mkdir -p ~/bacpipes-remote-db
cd ~/bacpipes-remote-db

# Transfer files from development machine
# (Use git, scp, or rsync)
```

### Step 2: Clone/Transfer BacPipes Remote DB Files

**Option A: Via Git** (recommended after pushing to gitea)

```bash
git clone http://10.0.10.2:30008/ak101/dev-bacnet-discovery-docker.git
cd dev-bacnet-discovery-docker

# Checkout to remote-db branch (if created separately)
# git checkout remote-db
```

**Option B: Transfer specific files**

```bash
# From development machine:
cd /home/ak101/BacPipes

# Transfer to remote server
scp docker-compose.remote-db.yml user@remote-server:~/bacpipes-remote-db/
scp -r remote-db user@remote-server:~/bacpipes-remote-db/
scp .env.remote-db.example user@remote-server:~/bacpipes-remote-db/.env
```

### Step 3: Configure Environment

```bash
# On remote server
cd ~/bacpipes-remote-db

# Edit .env file
nano .env

# Update these critical values:
REMOTE_DB_PASSWORD=your_strong_database_password
REMOTE_GRAFANA_PASSWORD=your_grafana_admin_password
REMOTE_API_KEY=generate-a-strong-random-key-here
```

**Generate strong API key**:
```bash
# Generate random API key
openssl rand -base64 32
# Example output: 7xK9mP3wQ8vN2jR5tY6uL1oS4cD8fH0g==
```

### Step 4: Deploy Remote Stack

```bash
# Build and start services
docker compose -f docker-compose.remote-db.yml up -d

# Check service status
docker compose -f docker-compose.remote-db.yml ps

# Expected output:
# NAME                           STATUS              PORTS
# bacpipes-remote-timescaledb    Up (healthy)        0.0.0.0:5436->5432/tcp
# bacpipes-remote-api            Up (healthy)        0.0.0.0:8080->8080/tcp
# bacpipes-remote-grafana        Up                  0.0.0.0:3003->3000/tcp
```

### Step 5: Verify Deployment

**Check API health**:
```bash
curl http://localhost:8080/health

# Expected response:
# {"status":"healthy","database":"connected"}
```

**Check database**:
```bash
docker exec -it bacpipes-remote-timescaledb psql -U anatoli -d bacnet_central

# Inside psql:
\dt               # List tables
SELECT * FROM sites;  # Should show 2 test sites
\q                # Exit
```

**Access Grafana**:
```
http://remote-server-ip:3003
Username: admin
Password: (value from REMOTE_GRAFANA_PASSWORD)
```

---

## Part 2: Configure Site Clients

### Step 1: Install Site Client

**On each BacPipes site** (LXC containers):

```bash
# Navigate to BacPipes directory
cd /home/ak101/BacPipes

# Install Python dependencies
pip3 install requests psycopg2-binary

# Make sync script executable
chmod +x site-client/sync_to_remote.py
```

### Step 2: Configure Site Client

```bash
# Create environment file
cp .env.remote-db.example site-client/.env

# Edit configuration
nano site-client/.env
```

**Update these values**:
```bash
# Unique site name (must match on remote)
SITE_NAME=office_building_1  # or factory_1, etc.

# Local database (should already be running)
LOCAL_DB_HOST=localhost
LOCAL_DB_PORT=5435
LOCAL_DB_NAME=bacnet_timeseries
LOCAL_DB_USER=anatoli
LOCAL_DB_PASSWORD=

# Remote server details
REMOTE_API_URL=http://your-remote-server-ip:8080
REMOTE_API_KEY=7xK9mP3wQ8vN2jR5tY6uL1oS4cD8fH0g==  # From remote .env

# Sync settings
SYNC_INTERVAL=300  # 5 minutes (adjust as needed)
BATCH_SIZE=1000    # Readings per sync
```

### Step 3: Register Site on Remote

**First, register the site**:

```bash
# From site machine
curl -X POST http://your-remote-server-ip:8080/api/sites/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "site_name": "office_building_1",
    "location": "123 Main Street, Kuala Lumpur",
    "timezone": "Asia/Kuala_Lumpur"
  }'

# Expected response:
# {"success":true,"site_id":3,"message":"Site 'office_building_1' registered successfully"}
```

### Step 4: Test Site Client

**Manual test run**:

```bash
cd /home/ak101/BacPipes/site-client

# Load environment
set -a
source .env
set +a

# Run once
python3 sync_to_remote.py

# Expected output:
# 2025-11-09 15:30:00 - INFO - Starting sync cycle
# 2025-11-09 15:30:01 - INFO - Remote API is healthy
# 2025-11-09 15:30:02 - INFO - Fetched 237 readings from local DB
# 2025-11-09 15:30:03 - INFO - Successfully sent 237 readings to remote
# 2025-11-09 15:30:03 - INFO - Sync completed successfully
```

**Verify on remote**:

```bash
# On remote server
curl http://localhost:8080/api/sites/stats \
  -H "X-API-Key: your-api-key-here"

# Should show your site with reading counts
```

### Step 5: Run Site Client as Service

**Option A: Using systemd** (recommended for production)

```bash
# Create systemd service file
sudo nano /etc/systemd/system/bacpipes-sync.service
```

```ini
[Unit]
Description=BacPipes Remote Sync Client
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=ak101
WorkingDirectory=/home/ak101/BacPipes/site-client
EnvironmentFile=/home/ak101/BacPipes/site-client/.env
ExecStart=/usr/bin/python3 /home/ak101/BacPipes/site-client/sync_to_remote.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable bacpipes-sync
sudo systemctl start bacpipes-sync

# Check status
sudo systemctl status bacpipes-sync

# View logs
sudo journalctl -u bacpipes-sync -f
```

**Option B: Using Docker** (alternative)

```bash
# Add to existing docker-compose.yml
```

```yaml
  site-sync-client:
    image: python:3.11-slim
    container_name: bacpipes-site-sync
    restart: unless-stopped
    volumes:
      - ./site-client:/app
    working_dir: /app
    env_file:
      - site-client/.env
    command: >
      bash -c "
      pip install --no-cache-dir requests psycopg2-binary &&
      python sync_to_remote.py
      "
    networks:
      - bacpipes-network
```

```bash
# Restart stack
docker compose up -d site-sync-client
```

---

## Part 3: Monitoring and Maintenance

### View Site Statistics

**From remote server**:

```bash
# Get all sites status
curl http://localhost:8080/api/sites/stats \
  -H "X-API-Key: your-api-key-here" | jq

# Get data quality
curl http://localhost:8080/api/quality/by-site \
  -H "X-API-Key: your-api-key-here" | jq
```

### Check Database Size

```bash
docker exec -it bacpipes-remote-timescaledb psql -U anatoli -d bacnet_central -c "
SELECT
    pg_size_pretty(pg_database_size('bacnet_central')) as db_size,
    (SELECT COUNT(*) FROM sensor_readings) as total_readings,
    (SELECT COUNT(DISTINCT site_id) FROM sensor_readings) as total_sites;
"
```

### View Logs

```bash
# Remote API logs
docker compose -f docker-compose.remote-db.yml logs -f remote-api

# TimescaleDB logs
docker compose -f docker-compose.remote-db.yml logs -f remote-timescaledb

# Site client logs (if using systemd)
sudo journalctl -u bacpipes-sync -f
```

---

## Part 4: Create Multi-Site Grafana Dashboards

### Access Central Grafana

```
URL: http://remote-server-ip:3003
Username: admin
Password: (from REMOTE_GRAFANA_PASSWORD)
```

### Add TimescaleDB Datasource

1. Go to: Configuration → Data Sources → Add data source
2. Select: PostgreSQL
3. Configure:
   ```
   Name: Central TimescaleDB
   Host: remote-timescaledb:5432
   Database: bacnet_central
   User: anatoli
   Password: (from REMOTE_DB_PASSWORD)
   TLS/SSL Mode: disable
   ```
4. Click "Save & Test"

### Example Multi-Site Dashboard Query

**Site Comparison - Temperature Averages**:

```sql
SELECT
    time_bucket('1 hour', bucket) AS time,
    site_name,
    AVG(avg_value) as avg_temperature
FROM sensor_readings_hourly
WHERE
    $__timeFilter(bucket)
    AND units = 'degreesCelsius'
GROUP BY time_bucket('1 hour', bucket), site_name
ORDER BY time
```

**Cross-Site Data Quality**:

```sql
SELECT
    site_name,
    quality_percent as "Quality %"
FROM data_quality_by_site
ORDER BY site_name
```

---

## Deployment Workflow

### For Testing (Local Development)

**1. Deploy Remote DB on local machine**:
```bash
cd /home/ak101/BacPipes
docker compose -f docker-compose.remote-db.yml up -d
```

**2. Run site client locally**:
```bash
cd site-client
python3 sync_to_remote.py
```

**3. Test and verify**:
```bash
# Check API stats
curl http://localhost:8080/api/sites/stats -H "X-API-Key: your-api-key-here"

# Check Grafana
open http://localhost:3003
```

**4. Once tested, commit and push**:
```bash
git add docker-compose.remote-db.yml remote-db/ site-client/
git commit -m "Add remote database support for multi-site aggregation"
git push origin development
```

### For Production Deployment

**1. Push to Gitea** (from development machine):
```bash
git push origin development
# or create separate branch: git push origin remote-db-feature
```

**2. Pull on remote hardware**:
```bash
# On remote server
git clone http://10.0.10.2:30008/ak101/dev-bacnet-discovery-docker.git
cd dev-bacnet-discovery-docker
git checkout development  # or remote-db-feature
```

**3. Deploy**:
```bash
# Configure .env
cp .env.remote-db.example .env
nano .env  # Update passwords and API key

# Start stack
docker compose -f docker-compose.remote-db.yml up -d
```

**4. Configure each site** (from site machines):
```bash
# Update site-client/.env with remote server IP
nano site-client/.env

# Start sync service
sudo systemctl start bacpipes-sync
```

---

## Security Considerations

### Network Security

**Firewall rules (remote server)**:
```bash
# Allow only from known site IPs
sudo ufw allow from 10.0.10.0/24 to any port 8080
sudo ufw allow from 192.168.1.0/24 to any port 8080

# Or allow all if on trusted internal network
sudo ufw allow 8080/tcp
sudo ufw allow 3003/tcp
```

### TLS/HTTPS (Production)

For internet-facing deployments, use reverse proxy with TLS:

```nginx
# /etc/nginx/sites-available/bacpipes-remote
server {
    listen 443 ssl;
    server_name bacpipes.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/bacpipes.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bacpipes.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then update site clients:
```bash
REMOTE_API_URL=https://bacpipes.yourdomain.com
```

### API Key Rotation

**To rotate API keys**:

```bash
# Generate new key
openssl rand -base64 32

# Update on remote server (.env)
REMOTE_API_KEY=new-key-here

# Restart remote API
docker compose -f docker-compose.remote-db.yml restart remote-api

# Update all site clients (.env)
# Restart site sync services
```

---

## Troubleshooting

### Remote API Not Reachable

**Check**:
```bash
# Test from site
curl http://remote-server-ip:8080/health

# Check remote firewall
sudo ufw status

# Check if API is running
docker compose -f docker-compose.remote-db.yml ps
```

### Site Data Not Appearing

**Check**:
```bash
# Site client logs
sudo journalctl -u bacpipes-sync -n 50

# Remote API logs
docker compose -f docker-compose.remote-db.yml logs remote-api

# Verify site is registered
curl http://localhost:8080/api/sites/stats -H "X-API-Key: key"
```

### Database Growing Too Large

**Apply retention policy**:
```sql
-- Drop data older than 6 months
SELECT add_retention_policy('sensor_readings', INTERVAL '6 months');

-- Or manually delete
DELETE FROM sensor_readings WHERE time < NOW() - INTERVAL '6 months';
```

---

## Summary

**What you've built**:
- ✅ Centralized TimescaleDB for multi-site data
- ✅ REST API for secure site-to-central communication
- ✅ Automated sync clients for each site
- ✅ Multi-site Grafana dashboards
- ✅ Scalable architecture (add more sites easily)

**Next steps**:
1. Test locally (docker-compose.remote-db.yml)
2. Commit and push to Gitea
3. Deploy to remote hardware
4. Configure each site client
5. Create multi-site Grafana dashboards
6. Monitor and optimize

**Questions?** See `doc/REMOTE_DATABASE_API.md` for API reference or `doc/REMOTE_DATABASE_ARCHITECTURE.md` for deep-dive architecture details.
