# MQTT Bridge Architecture

This directory contains the configuration for a two-broker MQTT bridge system for BacPipes.

## Architecture

```
BACnet Devices → bacnet-worker → mqtt-local:1883 → [BRIDGE] → mqtt-remote:1883 → BacPipes-Remote
                                       ↓
                                  telegraf
                                       ↓
                                 TimescaleDB
```

## Broker Configuration

### mqtt-local (Port 1883)
- **Role**: Local edge broker
- **Receives from**: bacnet-worker, telegraf (writes data to TimescaleDB)
- **Bridges to**: mqtt-remote (forwards all topics)
- **Host port**: 1883
- **Container name**: bacpipes-mqtt-local
- **Simulates**: External broker at 10.0.60.2

### mqtt-remote (Port 1884)
- **Role**: Remote/cloud broker
- **Receives from**: mqtt-local (bridged topics)
- **Used by**: BacPipes-Remote (cloud monitoring)
- **Host port**: 1884 (mapped from container port 1883)
- **Container name**: bacpipes-mqtt-remote
- **Simulates**: External broker at 10.0.60.3

## Bridge Configuration

**Topics Forwarded**:
- `klcc/#` → Forward all site topics (QoS 1)
- `menara/#` → Forward all site topics (QoS 1)
- `#` → Forward everything with prefix `remote/` (QoS 0)

**Example**:
- Publish to mqtt-local: `klcc/ahu_12/ai1/presentValue`
- Available on mqtt-remote: `klcc/ahu_12/ai1/presentValue` AND `remote/klcc/ahu_12/ai1/presentValue`

## Testing the Bridge

### 1. Check broker status
```bash
cd /home/ak101/BacPipes

# View MQTT broker logs
docker compose logs mqtt-local | tail -20
docker compose logs mqtt-remote | tail -20

# Look for bridge connection messages
docker compose logs mqtt-local | grep bridge
```

### 2. Test local broker
```bash
# Subscribe to all topics on local broker
docker exec bacpipes-mqtt-local mosquitto_sub -t "#" -v

# In another terminal, publish test message
docker exec bacpipes-mqtt-local mosquitto_pub -t "klcc/test" -m "hello from local"
```

### 3. Test bridge forwarding
```bash
# Subscribe on remote broker
docker exec bacpipes-mqtt-remote mosquitto_sub -t "klcc/#" -v

# Publish on local broker
docker exec bacpipes-mqtt-local mosquitto_pub -t "klcc/test" -m "bridge test"

# Should see message appear on remote broker
```

### 4. Test from host (via exposed ports)
```bash
# Subscribe to remote broker (port 1884)
mosquitto_sub -h localhost -p 1884 -t "klcc/#" -v

# Publish to local broker (port 1883)
mosquitto_pub -h localhost -p 1883 -t "klcc/test" -m "test from host"

# Should see message on remote subscriber
```

### 5. Verify bacnet-worker publishes
```bash
# Subscribe to all topics on local broker
docker exec bacpipes-mqtt-local mosquitto_sub -t "#" -v

# Check bacnet-worker logs
docker compose logs bacnet-worker | grep "Published"

# Should see real BACnet data being published
```

### 6. Verify telegraf receives data
```bash
# Check telegraf logs
docker compose logs telegraf | tail -20

# Should see messages like:
# "Received message on topic: klcc/ahu_12/ai1/presentValue"
# "Inserted reading into TimescaleDB"
```

## Troubleshooting

### Bridge not connecting
```bash
# Check mqtt-remote is reachable from mqtt-local
docker exec bacpipes-mqtt-local ping mqtt-remote

# Check bridge logs
docker compose logs mqtt-local | grep -i "bridge\|error"

# Verify both brokers are healthy
docker compose ps | grep mqtt
```

### Messages not forwarding
```bash
# Verify topic patterns in bridge configuration
cat mosquitto/local/mosquitto.conf | grep "topic"

# Test with wildcard subscription on remote
docker exec bacpipes-mqtt-remote mosquitto_sub -t "#" -v

# Publish to local and watch for messages
docker exec bacpipes-mqtt-local mosquitto_pub -t "test/topic" -m "hello"
```

### Worker can't connect to MQTT
```bash
# Check worker environment variables
docker compose exec bacnet-worker env | grep MQTT

# Should see:
# MQTT_BROKER=localhost
# MQTT_PORT=1883

# Test connectivity from host network (worker uses host networking)
mosquitto_sub -h localhost -p 1883 -t "$SYS/broker/version" -C 1
```

## Migration to External Brokers

Once the bridge is proven working in Docker, you can migrate to external LXC containers:

### Step 1: Export configurations
```bash
# Local broker config
cp mosquitto/local/mosquitto.conf /tmp/local_broker.conf

# Remote broker config
cp mosquitto/remote/mosquitto.conf /tmp/remote_broker.conf

# Update bridge address in local_broker.conf:
# Change: address mqtt-remote:1883
# To: address 10.0.60.3:1883
```

### Step 2: Deploy to LXC containers
```bash
# Copy to local broker (10.0.60.2)
scp /tmp/local_broker.conf ak101@10.0.60.2:/etc/mosquitto/mosquitto.conf

# Copy to remote broker (10.0.60.3)
scp /tmp/remote_broker.conf ak101@10.0.60.3:/etc/mosquitto/mosquitto.conf

# Restart services
ssh ak101@10.0.60.2 "sudo systemctl restart mosquitto"
ssh ak101@10.0.60.3 "sudo systemctl restart mosquitto"
```

### Step 3: Update BacPipes configuration
```bash
# Edit docker-compose.yml
# Change MQTT_BROKER from "localhost" to "10.0.60.2"

# Restart worker and telegraf
docker compose restart bacnet-worker telegraf
```

## File Structure

```
mosquitto/
├── README.md (this file)
├── local/
│   └── mosquitto.conf      # Local broker config with bridge
└── remote/
    └── mosquitto.conf      # Remote broker config
```

## Notes

- Both brokers use anonymous authentication (no username/password) - **suitable for trusted networks only**
- For production, add TLS encryption and authentication
- Bridge uses QoS 1 for important site topics (klcc, menara) to ensure delivery
- Persistence is enabled on both brokers to survive restarts
- Health checks verify brokers are responding to MQTT subscriptions
