#!/bin/bash
# Helper script to manage local development containers (Mosquitto, InfluxDB, Subscriber)
# since system docker-compose is unavailable.

ACTION=$1

if [ "$ACTION" == "start" ]; then
    echo "Starting infrastructure containers..."
    
    # 1. Start Mosquitto
    docker rm -f twinedge_mosquitto 2>/dev/null || true
    docker run -d \
        --name twinedge_mosquitto \
        -p 1883:1883 \
        -v /home/saran/project/TwinEdge/backend/config/mosquitto.conf:/mosquitto/config/mosquitto.conf \
        eclipse-mosquitto:2.0.18
        
    # 2. Start InfluxDB
    docker rm -f twinedge_influxdb 2>/dev/null || true
    docker run -d \
        --name twinedge_influxdb \
        -p 8086:8086 \
        -e DOCKER_INFLUXDB_INIT_MODE=setup \
        -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
        -e DOCKER_INFLUXDB_INIT_PASSWORD=adminpassword \
        -e DOCKER_INFLUXDB_INIT_ORG=twinedge \
        -e DOCKER_INFLUXDB_INIT_BUCKET=telemetry \
        -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=my-super-secret-admin-token-12345 \
        influxdb:2.7.6
        
    # 3. Start MQTT Subscriber
    docker rm -f twinedge_subscriber 2>/dev/null || true
    # We wait a couple of seconds for Mosquitto to start up
    sleep 2
    docker run -d \
        --name twinedge_subscriber \
        --network host \
        -e MQTT_HOST=localhost \
        -e MQTT_PORT=1883 \
        -e INFLUXDB_URL=http://localhost:8086 \
        -e INFLUXDB_TOKEN=my-super-secret-admin-token-12345 \
        -e INFLUXDB_ORG=twinedge \
        -e INFLUXDB_BUCKET=telemetry \
        -v /home/saran/project/TwinEdge/backend:/app \
        twinedge_backend \
        python3 -u app/influx_writer.py

        
    echo "Mosquitto, InfluxDB, and Subscriber started successfully."
    docker ps

elif [ "$ACTION" == "stop" ]; then
    echo "Stopping infrastructure containers..."
    docker stop twinedge_mosquitto twinedge_influxdb twinedge_subscriber 2>/dev/null || true
    docker rm twinedge_mosquitto twinedge_influxdb twinedge_subscriber 2>/dev/null || true
    echo "Infrastructure containers stopped and removed."

elif [ "$ACTION" == "status" ]; then
    docker ps -a --filter name=twinedge_

else
    echo "Usage: $0 {start|stop|status}"
    exit 1
fi
