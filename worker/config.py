"""
BacPipes Worker Configuration
To be implemented in Milestone 4
"""

import os
from dataclasses import dataclass

@dataclass
class Config:
    # Database
    DB_HOST: str = os.getenv('DB_HOST', 'postgres')
    DB_PORT: int = int(os.getenv('DB_PORT', '5432'))
    DB_NAME: str = os.getenv('DB_NAME', 'bacpipes')
    DB_USER: str = os.getenv('DB_USER', 'anatoli')

    # BACnet
    BACNET_IP: str = os.getenv('BACNET_IP', '192.168.1.35')
    BACNET_PORT: int = int(os.getenv('BACNET_PORT', '47808'))

    # MQTT
    MQTT_BROKER: str = os.getenv('MQTT_BROKER', '10.0.60.50')
    MQTT_PORT: int = int(os.getenv('MQTT_PORT', '1883'))
    MQTT_CLIENT_ID: str = os.getenv('MQTT_CLIENT_ID', 'bacpipes_worker')

    # Polling
    DEFAULT_POLL_INTERVAL: int = int(os.getenv('DEFAULT_POLL_INTERVAL', '60'))
    CONFIG_REFRESH_INTERVAL: int = int(os.getenv('CONFIG_REFRESH_INTERVAL', '60'))
