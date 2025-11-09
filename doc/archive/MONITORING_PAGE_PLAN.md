# Monitoring Page Implementation Plan

**Feature:** Real-Time BACnet Data Monitoring & Write Control
**Status:** 🚧 In Progress
**Milestone:** M6

---

## Overview

The Monitoring page provides real-time visibility into BACnet data being published to MQTT, with the ability to override point values directly from the web UI. This completes the read/write loop for local operations.

### Key Features:
1. **Real-time data streaming** from MQTT broker via Server-Sent Events (SSE)
2. **Live point values** grouped by device/equipment
3. **Write/override functionality** for writable BACnet points
4. **Priority level control** (BACnet priorities 1-16)
5. **Visual feedback** for stale data, write success/failure
6. **Auto-refresh** with pause/resume controls

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Monitoring Page)                 │
├─────────────────────────────────────────────────────────────┤
│  React Component                                            │
│  ↓ EventSource('/api/monitoring/stream')                   │
│  ↓ Receives SSE messages                                    │
│  ↓ Updates state (Map<topic, value>)                        │
│  ↓ Renders live data                                        │
│                                                              │
│  User clicks "Override" button                              │
│  ↓ POST /api/bacnet/write                                   │
│  ↓ Shows loading indicator                                  │
│  ↓ Displays success/error toast                             │
└─────────────────────────────────────────────────────────────┘
         ↑ SSE stream                    │ HTTP POST
         │                               ↓
┌─────────────────────────────────────────────────────────────┐
│              Next.js API Routes                             │
├─────────────────────────────────────────────────────────────┤
│  GET /api/monitoring/stream                                 │
│  ├─ Connect to MQTT broker (10.0.60.2:1883)                │
│  ├─ Subscribe to all topics (#)                            │
│  ├─ Stream messages as SSE events                          │
│  └─ Auto-cleanup on disconnect                             │
│                                                              │
│  POST /api/bacnet/write                                     │
│  ├─ Validate point is writable                             │
│  ├─ Publish to bacnet/write/command topic                  │
│  └─ Return success/error                                    │
└─────────────────────────────────────────────────────────────┘
         ↑ MQTT subscribe                │ MQTT publish
         │                               ↓
┌─────────────────────────────────────────────────────────────┐
│              MQTT Broker (Mosquitto)                        │
│              10.0.60.2:1883                                 │
└─────────────────────────────────────────────────────────────┘
         ↑ Publishes data                │ Receives commands
         │                               ↓
┌─────────────────────────────────────────────────────────────┐
│              BacPipes Worker                                │
├─────────────────────────────────────────────────────────────┤
│  1. Polls BACnet devices                                    │
│  2. Publishes to MQTT (macau-casino/ahu_301/ai1/...)       │
│  3. Subscribes to bacnet/write/command                      │
│  4. Executes BACnet writes                                  │
│  5. Publishes results to bacnet/write/result               │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### **Phase 1: SSE Streaming Infrastructure** ⏱️ 1-2 hours

**Goal:** Establish real-time data flow from MQTT to browser

**Tasks:**
- [ ] Install `mqtt` npm package in frontend
- [ ] Create `/api/monitoring/stream` route (SSE endpoint)
- [ ] Connect to MQTT broker, subscribe to all topics
- [ ] Stream MQTT messages as Server-Sent Events
- [ ] Handle client disconnection (cleanup)
- [ ] Test with `curl` or EventSource in browser console

**Deliverable:** API endpoint streaming live MQTT data

**Testing:**
```bash
# Terminal 1: Start services
docker compose up

# Terminal 2: Test SSE endpoint
curl -N http://localhost:3001/api/monitoring/stream

# Should see:
# data: {"type":"connected"}
# data: {"type":"message","topic":"macau-casino/...","payload":{...}}
```

---

### **Phase 2: Basic Monitoring Page UI** ⏱️ 2-3 hours

**Goal:** Display live data in user-friendly format

**Tasks:**
- [ ] Create `/monitoring/page.tsx`
- [ ] Set up EventSource connection to SSE endpoint
- [ ] State management (Map for point data)
- [ ] Basic layout: header, statistics, point list
- [ ] Point cards with device grouping
- [ ] Auto-refresh toggle (pause/resume)
- [ ] Time ago display (e.g., "3s ago")
- [ ] Color coding by freshness (green/yellow/red)

**Deliverable:** Working monitoring page showing live data

**UI Structure:**
```
- Header: "Real-Time Monitoring"
- Statistics row: Total points, Last update, Status, Errors
- Controls: Pause/Resume, Clear, Export
- Point cards grouped by device:
  - Device header (name, IP, device ID)
  - Point rows:
    - Display name (dis field)
    - Current value + units
    - Last update timestamp
    - Quality indicator
    - MQTT topic (with copy button)
```

---

### **Phase 3: Write Command API** ⏱️ 1-2 hours

**Goal:** Backend support for BACnet writes

**Tasks:**
- [ ] Create `/api/bacnet/write` route (POST)
- [ ] Validate request body (pointId, value, priority, release)
- [ ] Fetch point from database (check isWritable)
- [ ] Connect to MQTT broker
- [ ] Publish write command to `bacnet/write/command` topic
- [ ] Handle errors (point not found, not writable, MQTT failure)
- [ ] Return job ID for tracking

**Command Format:**
```json
{
  "jobId": "uuid-1234",
  "pointId": 14,
  "deviceId": 221,
  "deviceIp": "192.168.1.37",
  "objectType": "analog-output",
  "objectInstance": 104,
  "value": 50.0,
  "priority": 8,
  "release": false
}
```

**Deliverable:** API endpoint for sending write commands

---

### **Phase 4: Worker Write Handler** ⏱️ 2-3 hours

**Goal:** Worker executes BACnet writes from MQTT commands

**Tasks:**
- [ ] Add MQTT subscription to `bacnet/write/command` in worker
- [ ] Implement `on_write_command()` handler
- [ ] Parse command message (validate fields)
- [ ] Execute BACnet write using BACpypes3
- [ ] Handle priority writes vs releases
- [ ] Publish result to `bacnet/write/result` topic
- [ ] Error handling (invalid device, communication failure)
- [ ] Logging (all writes logged with timestamp)

**Write Function:**
```python
async def write_bacnet_value(
    self,
    device_ip: str,
    device_id: int,
    object_type: str,
    object_instance: int,
    value: float,
    priority: int
) -> bool:
    """Execute BACnet write using BACpypes3"""
    try:
        # Create write request
        request = WritePropertyRequest(
            objectIdentifier=(object_type, object_instance),
            propertyIdentifier='presentValue',
            propertyValue=value,
            priority=priority
        )
        request.pduDestination = Address(f"{device_ip}:47808")

        # Send request
        iocb = await self.bacnet_app.request(request)

        # Wait for response
        if iocb.ioResponse:
            return True
        else:
            logger.error(f"Write failed: {iocb.ioError}")
            return False

    except Exception as e:
        logger.error(f"BACnet write exception: {e}")
        return False
```

**Deliverable:** Worker that executes MQTT write commands

---

### **Phase 5: Write UI Components** ⏱️ 3-4 hours

**Goal:** User interface for overriding BACnet points

**Tasks:**
- [ ] Create `WriteModal` component
- [ ] Point info display (current value, device, type)
- [ ] Value input field (number/boolean based on point type)
- [ ] Priority dropdown (1-16 with names)
- [ ] Release priority checkbox
- [ ] Safety warnings
- [ ] Submit button with loading state
- [ ] Success/error toast notifications
- [ ] Close on success or cancel
- [ ] Add "Override" button to point cards (only if writable)
- [ ] Disable override for non-writable points

**Priority Levels:**
```typescript
const PRIORITY_LEVELS = [
  { value: 1, label: '1 - Manual Life Safety', color: 'red' },
  { value: 2, label: '2 - Automatic Life Safety', color: 'red' },
  { value: 3, label: '3 - Available', color: 'orange' },
  { value: 4, label: '4 - Available', color: 'orange' },
  { value: 5, label: '5 - Critical Equipment', color: 'orange' },
  { value: 6, label: '6 - Minimum On/Off', color: 'yellow' },
  { value: 7, label: '7 - Available', color: 'yellow' },
  { value: 8, label: '8 - Manual Operator', color: 'green' }, // Default!
  { value: 9, label: '9 - Available', color: 'blue' },
  { value: 10, label: '10 - Available', color: 'blue' },
  { value: 11, label: '11 - Available', color: 'blue' },
  { value: 12, label: '12 - Available', color: 'blue' },
  { value: 13, label: '13 - Available', color: 'blue' },
  { value: 14, label: '14 - Available', color: 'gray' },
  { value: 15, label: '15 - Available', color: 'gray' },
  { value: 16, label: '16 - Scheduled', color: 'gray' },
];
```

**Deliverable:** Complete write interface with safety checks

---

### **Phase 6: Result Feedback Loop** ⏱️ 1-2 hours

**Goal:** Show write command results in UI

**Tasks:**
- [ ] Subscribe to `bacnet/write/result` topic in SSE stream
- [ ] Match results to pending writes (by jobId)
- [ ] Show success toast ("Value written successfully")
- [ ] Show error toast ("Write failed: communication error")
- [ ] Update point value after successful write
- [ ] Clear pending state after result received
- [ ] Timeout handling (if no result after 30 seconds)

**Result Format:**
```json
{
  "jobId": "uuid-1234",
  "success": true,
  "timestamp": "2025-11-04T10:00:15+08:00",
  "error": null
}
```

**Deliverable:** User sees immediate feedback on write operations

---

### **Phase 7: Enhanced Features** ⏱️ 2-3 hours

**Goal:** Polish and advanced functionality

**Tasks:**
- [ ] **Writability Detection:**
  - Add "Test Write" button (writes current value at priority 16)
  - Auto-populate `isWritable` field in database
  - Show write permissions badge on point cards

- [ ] **Priority Array Display:**
  - Fetch priority array from BACnet
  - Show which priorities are currently active
  - Visual representation (16 slots, highlight active)
  - "Release All" button to clear all overrides

- [ ] **Filtering & Search:**
  - Filter by device
  - Filter by writable/non-writable
  - Search by point name
  - Only show points with recent updates

- [ ] **Performance:**
  - Virtualized list for 100+ points
  - Debounce updates (max 1/second per point)
  - Efficient Map updates (only changed points)

- [ ] **Export:**
  - Export current values to CSV
  - Export write history to JSON
  - Copy all MQTT topics to clipboard

**Deliverable:** Production-ready monitoring page

---

### **Phase 8: Testing & Documentation** ⏱️ 1-2 hours

**Goal:** Ensure reliability and usability

**Tasks:**
- [ ] **Integration Tests:**
  - Write to analog output, verify value changes
  - Write to binary output, verify state changes
  - Release priority, verify value reverts
  - Test with unavailable device (error handling)
  - Test network failure during write

- [ ] **UI/UX Tests:**
  - Test with 1 point (simple case)
  - Test with 100+ points (performance)
  - Test pause/resume functionality
  - Test on mobile/tablet (responsive)
  - Test with slow network (loading states)

- [ ] **Documentation:**
  - Add monitoring page screenshots to README
  - Document write command format
  - Document priority levels
  - Add troubleshooting section

**Deliverable:** Tested, documented monitoring page

---

## Technical Specifications

### API Endpoints

#### `GET /api/monitoring/stream`

**Description:** Server-Sent Events stream of real-time MQTT data

**Response:** `text/event-stream`

**Events:**
```javascript
// Connection established
data: {"type":"connected","timestamp":"2025-11-04T10:00:00+08:00"}

// MQTT message received
data: {"type":"message","topic":"macau-casino/ahu_301/ai1/presentValue","payload":{...},"timestamp":"2025-11-04T10:00:05+08:00"}

// Write command result
data: {"type":"write_result","jobId":"uuid-1234","success":true,"timestamp":"2025-11-04T10:00:10+08:00"}
```

---

#### `POST /api/bacnet/write`

**Description:** Send write command to BACnet device

**Request Body:**
```json
{
  "pointId": 14,
  "value": 23.5,
  "priority": 8,
  "release": false
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid-1234",
  "message": "Write command sent"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Point is not writable"
}
```

**Status Codes:**
- `200`: Command sent successfully
- `400`: Invalid request (not writable, invalid priority)
- `404`: Point not found
- `500`: Server error (MQTT failure, database error)

---

### Database Changes

**No schema changes required!** Existing schema already has:
- `Point.isWritable` - Boolean flag for writability
- `Point.priorityArray` - Boolean flag if point has priority array
- `Point.priorityLevel` - Default priority for writes

**Future enhancement (Phase 7+):**
```sql
CREATE TABLE write_history (
  id SERIAL PRIMARY KEY,
  job_id UUID UNIQUE NOT NULL,
  point_id INT NOT NULL REFERENCES "Point"(id),
  value REAL,
  priority INT NOT NULL,
  release BOOLEAN DEFAULT FALSE,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_by TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_point_timestamp (point_id, timestamp),
  INDEX idx_job_id (job_id)
);
```

---

### Worker MQTT Topics

**Subscriptions (Worker listens to):**
- `bacnet/write/command` - Write commands from UI/API
- `bacnet/write/release` - Priority release commands (optional)

**Publications (Worker publishes to):**
- `macau-casino/ahu_301/ai1/presentValue` - Point data (existing)
- `bacnet/write/result` - Write command results (new)
- `bacnet/write/error` - Write errors (optional)

---

## Security Considerations

### Phase 1-8 (Local Network):
- ✅ MQTT without authentication (trusted network)
- ✅ No user authentication (internal tool)
- ⚠️ Suitable for internal deployment only

### Future Enhancements (WAN Deployment):
- [ ] User authentication (OAuth/SAML)
- [ ] Role-based access control (read-only vs operator vs admin)
- [ ] Write approval workflow (for critical equipment)
- [ ] Audit logging (who wrote what, when)
- [ ] Rate limiting (prevent accidental spam)
- [ ] Value validation (min/max bounds, allowed values)

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **SSE connection time** | <1 second | Time to establish stream |
| **Data update latency** | <100ms | MQTT → Browser |
| **Write command latency** | <5 seconds | UI → Worker → BACnet → Confirmation |
| **UI responsiveness** | 60 FPS | No lag with 100+ points |
| **Memory usage** | <100MB | Browser tab |
| **Concurrent connections** | 10+ users | Multiple operators viewing |

---

## Testing Checklist

### Functional Tests:
- [ ] Real-time data updates in browser
- [ ] Pause/resume functionality
- [ ] Auto-reconnect on network failure
- [ ] Write analog value (test with AO point)
- [ ] Write binary value (test with BO point)
- [ ] Release priority (value reverts to default)
- [ ] Write to invalid point (error shown)
- [ ] Write with invalid priority (validation error)
- [ ] Multiple users viewing simultaneously

### Error Scenarios:
- [ ] MQTT broker down (connection error shown)
- [ ] BACnet device offline (write fails gracefully)
- [ ] Invalid write value (validation error)
- [ ] Worker not running (commands timeout)
- [ ] Network interruption (auto-reconnect)

### UI/UX Tests:
- [ ] Responsive on mobile (360px width)
- [ ] Responsive on tablet (768px width)
- [ ] Color-blind friendly (status indicators)
- [ ] Keyboard navigation (tab through controls)
- [ ] Screen reader compatible (accessibility)

---

## Known Limitations

1. **No historical data** - Monitoring page shows only real-time data (fix: add TimescaleDB queries in Phase 6+)
2. **No charts** - Only current values, no trends (fix: add Chart.js graphs)
3. **No alerting** - No thresholds or alarms (fix: add alert rules in M7)
4. **No write queue** - Commands executed immediately (fix: add queue for scheduled writes)
5. **No batch writes** - One point at a time (fix: add multi-point write UI)

---

## Success Criteria

**Phase 1-6 Complete When:**
- ✅ Monitoring page displays live data from MQTT
- ✅ Data updates within 5 seconds of BACnet poll
- ✅ User can override writable points
- ✅ Write commands execute successfully
- ✅ Success/error feedback shown in UI
- ✅ Updated values reflect in monitoring page after write
- ✅ No console errors in browser
- ✅ No crashes in worker logs

**Ready for Production When:**
- ✅ All 8 phases complete
- ✅ Testing checklist 100% passed
- ✅ Documentation updated
- ✅ Performance targets met
- ✅ Deployed to 3 pilot sites for 1 week
- ✅ User feedback incorporated

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: SSE Infrastructure | 1-2 hours | None |
| Phase 2: Basic UI | 2-3 hours | Phase 1 |
| Phase 3: Write API | 1-2 hours | None (parallel with Phase 2) |
| Phase 4: Worker Handler | 2-3 hours | Phase 3 |
| Phase 5: Write UI | 3-4 hours | Phase 2, 3, 4 |
| Phase 6: Result Feedback | 1-2 hours | Phase 4, 5 |
| Phase 7: Enhanced Features | 2-3 hours | Phase 6 |
| Phase 8: Testing & Docs | 1-2 hours | All previous |
| **Total** | **13-21 hours** | ~2-3 working days |

---

## Next Steps

**Immediate Action:** Start Phase 1

```bash
cd /home/ak101/BacPipes/frontend
npm install mqtt
```

Then create `/api/monitoring/stream/route.ts` for SSE endpoint.

**Progress Tracking:** Update this document as phases complete, commit to Git after each phase.

---

**Document Maintained By:** BacPipes Development Team
**Created:** 2025-11-04
**Last Updated:** 2025-11-04
