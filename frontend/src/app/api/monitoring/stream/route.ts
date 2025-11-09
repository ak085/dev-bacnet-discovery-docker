// SSE endpoint for real-time MQTT data streaming
import { NextRequest } from 'next/server';
import mqtt from 'mqtt';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Active MQTT connections map (cleanup on client disconnect)
const activeConnections = new Map<string, mqtt.MqttClient>();

/**
 * Resolve broker connection for frontend's Docker bridge network
 * Frontend cannot access 'localhost' (would resolve to frontend container)
 * Maps localhost → mqtt-broker (Docker service name)
 * Maps host port → container port (1884 → 1883)
 * External brokers are used as-is
 */
function resolveBrokerForFrontend(dbBroker: string, dbPort: number): { broker: string; port: number } {
  // Localhost aliases: map to internal Docker service
  if (dbBroker === 'localhost' || dbBroker === '127.0.0.1') {
    return {
      broker: 'mqtt-broker',
      port: 1883  // Internal container port (not host-mapped 1884)
    };
  }
  // External broker: use as configured
  return {
    broker: dbBroker,
    port: dbPort
  };
}

export async function GET(request: NextRequest) {
  // Get MQTT configuration from database (source of truth)
  const mqttConfig = await prisma.mqttConfig.findFirst();

  if (!mqttConfig) {
    return new Response('MQTT configuration not found', { status: 500 });
  }

  // Resolve broker for frontend's network context
  // Frontend runs in Docker bridge network, worker/telegraf use host networking
  const { broker, port } = resolveBrokerForFrontend(mqttConfig.broker, mqttConfig.port);

  // Create Server-Sent Events stream
  const encoder = new TextEncoder();
  let clientId: string;
  let mqttClient: mqtt.MqttClient | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Generate unique client ID
      clientId = `bacpipes_monitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Connect to MQTT broker (using Docker service name)
      const brokerUrl = `mqtt://${broker}:${port}`;

      try {
        mqttClient = mqtt.connect(brokerUrl, {
          clientId,
          clean: true,
          reconnectPeriod: 5000,
          connectTimeout: 30000,
        });

        // Store connection for cleanup
        activeConnections.set(clientId, mqttClient);

        // Connection successful
        mqttClient.on('connect', () => {
          console.log(`[SSE] Client ${clientId} connected to MQTT broker at ${broker}:${port}`);

          // Send connection success event
          const data = encoder.encode(`data: ${JSON.stringify({
            type: 'connected',
            timestamp: new Date().toISOString(),
            broker: `${broker}:${port}`
          })}\n\n`);
          controller.enqueue(data);

          // Subscribe to all topics
          if (mqttClient) {
            mqttClient.subscribe('#', { qos: 1 }, (err) => {
              if (err) {
                console.error(`[SSE] Subscription error:`, err);
                const errorData = encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  message: 'Failed to subscribe to MQTT topics',
                  error: err.message
                })}\n\n`);
                controller.enqueue(errorData);
              } else {
                console.log(`[SSE] Client ${clientId} subscribed to all topics (#)`);
                const subData = encoder.encode(`data: ${JSON.stringify({
                  type: 'subscribed',
                  timestamp: new Date().toISOString(),
                  pattern: '#'
                })}\n\n`);
                controller.enqueue(subData);
              }
            });
          }
        });

        // Handle incoming MQTT messages
        mqttClient.on('message', (topic, payload) => {
          try {
            // Parse payload
            let data;
            try {
              data = JSON.parse(payload.toString());
            } catch (e) {
              // If not JSON, treat as plain text
              data = { value: payload.toString() };
            }

            // Stream message to browser
            // Use timestamp from MQTT payload (worker's configured timezone)
            // Fall back to current time only if payload has no timestamp
            const event = encoder.encode(`data: ${JSON.stringify({
              type: 'mqtt_message',
              topic,
              payload: data,
              timestamp: data.timestamp || new Date().toISOString()
            })}\n\n`);

            controller.enqueue(event);
          } catch (error) {
            console.error('[SSE] Error processing message:', error);
          }
        });

        // Handle MQTT errors
        mqttClient.on('error', (error) => {
          console.error(`[SSE] MQTT error for client ${clientId}:`, error);
          const errorData = encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: 'MQTT connection error',
            error: error.message,
            timestamp: new Date().toISOString()
          })}\n\n`);
          controller.enqueue(errorData);
        });

        // Handle MQTT disconnection
        mqttClient.on('close', () => {
          console.log(`[SSE] MQTT connection closed for client ${clientId}`);
          const closeData = encoder.encode(`data: ${JSON.stringify({
            type: 'disconnected',
            timestamp: new Date().toISOString()
          })}\n\n`);
          controller.enqueue(closeData);
        });

        // Send heartbeat every 15 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
          try {
            const heartbeat = encoder.encode(`data: ${JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            })}\n\n`);
            controller.enqueue(heartbeat);
          } catch (error) {
            clearInterval(heartbeatInterval);
          }
        }, 15000);

        // Cleanup on stream cancel (client disconnect)
        return () => {
          clearInterval(heartbeatInterval);

          if (mqttClient) {
            console.log(`[SSE] Cleaning up MQTT connection for client ${clientId}`);
            mqttClient.end(true);
            activeConnections.delete(clientId);
          }
        };

      } catch (error) {
        console.error('[SSE] Failed to connect to MQTT:', error);
        const errorData = encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          message: 'Failed to connect to MQTT broker',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        })}\n\n`);
        controller.enqueue(errorData);
        controller.close();
      }
    },

    cancel() {
      // Client disconnected, cleanup
      console.log(`[SSE] Stream cancelled for client ${clientId}`);
      const client = activeConnections.get(clientId);
      if (client) {
        client.end(true);
        activeConnections.delete(clientId);
      }
    }
  });

  // Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for nginx
    },
  });
}
