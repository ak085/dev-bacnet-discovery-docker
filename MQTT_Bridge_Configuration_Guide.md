# MQTT Bridge Configuration Guide

## Overview

This guide documents the MQTT bridge configuration for remote data collection. The bridge is installed on a remote LXC container (Mosquitto-Remote) that connects to a primary MQTT broker to collect and forward all messages.

## Architecture

```
Primary MQTT Broker (10.0.60.3)
    ↓ (publishes messages)
Remote Bridge Container (10.0.80.3)
    ↓ (bridges all topics)
Local MQTT Broker (10.0.80.3)
    ↓ (consumers can subscribe locally)
```

**Purpose**: Install the bridge remotely to collect data from a primary MQTT broker located outside the building, enabling remote monitoring and data collection.

## Prerequisites

- Mosquitto 2.0.22+ installed on the remote container
- Network connectivity between remote container (10.0.80.3) and primary broker (10.0.60.3)
- Access to configure `/etc/mosquitto/` directory

## Configuration Files

### 1. Main Mosquitto Configuration

**File**: `/etc/mosquitto/mosquitto.conf`

```conf
# Mosquitto 2.0.22 Configuration
# Allow remote connections

# Listen on all interfaces, port 1883
listener 1883 0.0.0.0
allow_anonymous true

# Persistence
persistence true
persistence_location /var/lib/mosquitto/

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type all

# Include bridge configuration
include_dir /etc/mosquitto/conf.d
```

**Important Notes**:
- Use `include_dir` directive (not `include`) for Mosquitto 2.0.22+
- Ensure NO leading spaces in configuration lines
- `listener 1883 0.0.0.0` allows connections from any interface

### 2. Bridge Configuration

**File**: `/etc/mosquitto/conf.d/bridge.conf`

```conf
# MQTT Bridge Configuration
# Bridge from local broker (10.0.80.3) to remote broker (10.0.60.3)
# This configuration forwards all messages from 10.0.60.3 to the local broker (10.0.80.3)

connection bridge-to-remote
address 10.0.60.3:1883

# Subscribe to all topics from remote broker and forward to local
topic # both 0

# Bridge settings
bridge_protocol_version mqttv311
bridge_insecure false
try_private false
start_type automatic
notifications false
cleansession true
keepalive_interval 60

# Optional: If authentication is required on remote broker, uncomment and configure:
# remote_username your_username
# remote_password your_password
```

**Key Configuration Details**:
- **Connection Name**: `bridge-to-remote`
- **Remote Broker**: `10.0.60.3:1883` (primary broker)
- **Topic Pattern**: `#` (all topics)
- **Direction**: `both` (bidirectional - receives from remote and can send to remote)
- **QoS**: `0` (at most once delivery)
- **Clean Session**: `true` (does not persist session state)
- **Keepalive**: `60` seconds

## Deployment Steps

### Step 1: Verify Mosquitto Installation

```bash
# Check Mosquitto version (should be 2.0.22+)
mosquitto -v

# Check service status
systemctl status mosquitto
```

### Step 2: Configure Main Mosquitto Config

```bash
# Edit main configuration
sudo nano /etc/mosquitto/mosquitto.conf

# Ensure the file contains the configuration shown above
# Verify no leading spaces:
cat -A /etc/mosquitto/mosquitto.conf
```

### Step 3: Create Bridge Configuration

```bash
# Create bridge configuration directory (if it doesn't exist)
sudo mkdir -p /etc/mosquitto/conf.d

# Create bridge configuration file
sudo nano /etc/mosquitto/conf.d/bridge.conf

# Paste the bridge configuration shown above
# Set proper ownership and permissions
sudo chown mosquitto:mosquitto /etc/mosquitto/conf.d/bridge.conf
sudo chmod 644 /etc/mosquitto/conf.d/bridge.conf
```

### Step 4: Verify Configuration Syntax

```bash
# Test configuration for syntax errors
sudo mosquitto -c /etc/mosquitto/mosquitto.conf -v

# Press Ctrl+C after verifying no errors
# Look for errors like "Unknown configuration variable"
```

### Step 5: Restart Mosquitto Service

```bash
# Restart the service
sudo systemctl restart mosquitto

# Check status
sudo systemctl status mosquitto
# Should show: "active (running)"
```

### Step 6: Verify Bridge Connection

```bash
# Check network connectivity to primary broker
ping -c 3 10.0.60.3

# Check active connections
ss -tn | grep 10.0.60.3:1883
# Should show ESTABLISHED connections

# Monitor bridge connection logs
sudo journalctl -u mosquitto -f | grep bridge
# Look for connection messages
```

### Step 7: Test Message Reception

```bash
# Subscribe to all topics on local broker to verify messages are being received
mosquitto_sub -h localhost -t '#' -v

# You should see messages from the primary broker (10.0.60.3)
# Example topics you might see:
# - macau-casino/ahu_301/analogvalue110/presentValue
# - macau-casino/pau_212/analoginput435/presentValue
```

## Verification Checklist

- [ ] Mosquitto service is running (`systemctl status mosquitto`)
- [ ] Network connectivity to primary broker (10.0.60.3) is working
- [ ] Active TCP connections to 10.0.60.3:1883 exist
- [ ] Bridge configuration file exists at `/etc/mosquitto/conf.d/bridge.conf`
- [ ] Messages are being received when subscribing to `#` on localhost
- [ ] No configuration syntax errors in logs

## Troubleshooting

### Bridge Not Connecting

**Symptoms**: No messages received, no active connections to 10.0.60.3

**Solutions**:
1. Verify network connectivity:
   ```bash
   ping 10.0.60.3
   telnet 10.0.60.3 1883
   ```

2. Check firewall rules:
   ```bash
   sudo iptables -L -n | grep 1883
   ```

3. Verify primary broker is accessible:
   ```bash
   mosquitto_sub -h 10.0.60.3 -t '#' -v
   ```

4. Check Mosquitto logs:
   ```bash
   sudo journalctl -u mosquitto -n 100 | grep -i bridge
   sudo tail -100 /var/log/mosquitto/mosquitto.log
   ```

### Configuration Syntax Errors

**Symptoms**: Mosquitto fails to start, "Unknown configuration variable" errors

**Solutions**:
1. Check for leading spaces in config files:
   ```bash
   cat -A /etc/mosquitto/mosquitto.conf
   cat -A /etc/mosquitto/conf.d/bridge.conf
   ```

2. Remove leading spaces:
   ```bash
   sudo sed -i 's/^[[:space:]]//' /etc/mosquitto/mosquitto.conf
   sudo sed -i 's/^[[:space:]]//' /etc/mosquitto/conf.d/bridge.conf
   ```

3. Verify syntax:
   ```bash
   sudo mosquitto -c /etc/mosquitto/mosquitto.conf -v
   ```

### No Messages Received

**Symptoms**: Bridge connects but no messages appear when subscribing

**Solutions**:
1. Verify topic pattern matches published topics:
   - Current config uses `topic # both 0` (all topics)
   - Ensure primary broker is actually publishing messages

2. Test message flow:
   ```bash
   # On primary broker (10.0.60.3), publish a test message
   mosquitto_pub -h 10.0.60.3 -t "test/topic" -m "test message"
   
   # On remote bridge (10.0.80.3), subscribe
   mosquitto_sub -h localhost -t '#' -v
   ```

3. Check bridge direction:
   - Current config uses `both` direction
   - For receive-only, could use `in` direction

## Security Considerations

### Current Configuration (Development)

- **Authentication**: None (`allow_anonymous true`)
- **Encryption**: None (plain MQTT on port 1883)
- **Suitable for**: Trusted internal networks only

### Production Recommendations

1. **Enable TLS/SSL**:
   - Use port 8883 instead of 1883
   - Configure certificates in bridge config
   - Set `bridge_insecure false`

2. **Enable Authentication**:
   - Configure `remote_username` and `remote_password` in bridge.conf
   - Set up ACLs on primary broker

3. **Network Security**:
   - Use VPN or secure network tunnel
   - Implement firewall rules
   - Restrict broker access to specific IPs

## Configuration Differences from Documentation

**Note**: The actual deployed configuration differs from the example in `docs/mqtt-bridge-config.conf`:

1. **Include Method**: Uses `include_dir /etc/mosquitto/conf.d` instead of `include /etc/mosquitto/bridge.conf`
2. **Bridge Direction**: Uses `both` direction with `topic # both 0` to receive all messages from primary broker
3. **Clean Session**: Set to `true` (does not persist session state)
4. **IP Addresses**: 
   - Remote container: 10.0.80.3 (not 10.0.60.3 as in docs)
   - Primary broker: 10.0.60.3

## Maintenance

### Viewing Bridge Status

```bash
# Check active connections
ss -tn | grep 10.0.60.3

# Monitor logs in real-time
sudo journalctl -u mosquitto -f

# Check message reception
mosquitto_sub -h localhost -t '#' -C 10 -W 5
```

### Restarting Bridge

```bash
# Restart Mosquitto service
sudo systemctl restart mosquitto

# Or reload configuration (if supported)
sudo systemctl reload mosquitto
```

## References

- Mosquitto Configuration Manual: https://mosquitto.org/man/mosquitto-conf-5.html
- Bridge Configuration: https://mosquitto.org/man/mosquitto-conf-5.html#bridge
- Main repository: http://10.0.10.2:30008/ak101/dev-bacnet-discovery-docker

---

**Last Updated**: 2025-11-23  
**Mosquitto Version**: 2.0.22+  
**Tested Configuration**: LXC container on Proxmox
