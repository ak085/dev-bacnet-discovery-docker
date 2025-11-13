# Migration to Containerized MQTT Broker

## Current State
- **System Mosquitto**: Running on `localhost:1883` (systemd service)
- **mqtt-local container**: Running on port `11883` (bacpipes-mqtt-local)
- **mqtt-remote container**: Running on port `1884` (bacpipes-mqtt-remote)
- **Worker/Telegraf**: Currently using system mosquitto via `localhost:1883`

## Target State
- **mqtt-broker container**: Running on port `1883` (integrated edge broker)
- **mqtt-remote container**: Running on port `1884` (for testing bridge functionality)
- **System Mosquitto**: Stopped and disabled
- **Worker/Telegraf**: Using containerized mqtt-broker

## Migration Steps

### Step 1: Stop and Disable System Mosquitto Service

```bash
# Stop the system service
sudo systemctl stop mosquitto

# Disable auto-start on boot
sudo systemctl disable mosquitto

# Verify it's stopped
systemctl status mosquitto
```

### Step 2: Clean Up Old MQTT Containers

```bash
cd /home/ak101/BacPipes

# Stop and remove old mqtt-local container
docker compose stop mqtt-local
docker compose rm -f mqtt-local

# Start the new mqtt-broker on port 1883
docker compose up -d mqtt-broker --remove-orphans
```

### Step 3: Verify mqtt-broker is Running

```bash
# Check container status
docker compose ps mqtt-broker

# Check logs
docker compose logs --tail=20 mqtt-broker

# Test connection
docker exec bacpipes-mqtt mosquitto_sub -h localhost -t '$SYS/#' -C 5 -W 2
```

### Step 4: Update Worker Configuration (if needed)

The worker should connect via the container network. Check if worker needs env update:

```bash
# Worker environment should use:
MQTT_BROKER=mqtt-broker  # Container name (Docker DNS)
MQTT_PORT=1883

# OR (if using host networking):
MQTT_BROKER=localhost
MQTT_PORT=1883
```

Since worker is on host networking, it can connect to `localhost:1883` after we start the containerized broker.

### Step 5: Restart Worker and Telegraf

```bash
# Restart to pick up new broker
docker compose restart bacnet-worker telegraf

# Wait for health checks
sleep 10

# Verify connections
docker compose logs --tail=20 bacnet-worker | grep -i mqtt
docker compose logs --tail=20 telegraf | grep -i mqtt
```

### Step 6: Verify Data Flow

```bash
# Subscribe to topics on new broker
docker exec bacpipes-mqtt mosquitto_sub -t 'bacnet/#' -v

# Check if data is flowing to TimescaleDB
docker exec bacpipes-timescaledb psql -U anatoli -d timescaledb -c \
  "SELECT COUNT(*) FROM sensor_readings WHERE time > NOW() - INTERVAL '5 minutes';"
```

## Rollback Plan (if migration fails)

```bash
# Start system mosquitto again
sudo systemctl start mosquitto

# Worker will automatically reconnect to localhost:1883
```

## Port Allocation After Migration

| Service | Container Name | Host Port | Container Port |
|---------|---------------|-----------|----------------|
| **mqtt-broker** | bacpipes-mqtt | 1883 | 1883 |
| **mqtt-remote** | bacpipes-mqtt-remote | 1884 | 1883 |
| **postgres** | bacpipes-postgres | 5434 | 5432 |
| **timescaledb** | bacpipes-timescaledb | 5435 | 5432 |
| **frontend** | bacpipes-frontend | 3001 | 3000 |
| **grafana** | bacpipes-grafana | 3002 | 3000 |

## Benefits of Containerized MQTT Broker

1. **Self-contained deployment**: All services in docker-compose
2. **Portable**: Easy to deploy on new hardware (just `docker-compose up`)
3. **Version controlled**: Mosquitto config in git repo
4. **Bridge configuration**: Can be managed via Web UI
5. **Consistent**: Same setup on edge and cloud deployments
6. **Scalable**: Deploy to hundreds of devices without manual mosquitto installation

## Next Steps After Migration

1. Test point publishing: Add/remove/modify points via Web UI
2. Configure bridge to cloud (mqtt-remote or external)
3. Implement Web UI for bridge configuration
4. Add WAN security (TLS/tokens) for cloud bridge
5. Deploy to BacPipes-Remote for testing multi-site setup
