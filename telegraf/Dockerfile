FROM python:3.10-alpine

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python script
COPY mqtt_to_timescaledb.py .
RUN chmod +x mqtt_to_timescaledb.py

# Run the script
CMD ["python", "-u", "mqtt_to_timescaledb.py"]
