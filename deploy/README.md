# TwinEdge Production Deployment Guide
Target: AWS EC2 `t3.medium` (2 vCPU, 4 GiB RAM) in `ap-south-1` (Mumbai)

---

## 1. Network & Security Architecture
- **Inbound Security Group Rules**:
  - `Port 80 (HTTP)`: `0.0.0.0/0` (Redirected / handled by Caddy)
  - `Port 443 (HTTPS)`: `0.0.0.0/0` (TLS terminated by Caddy)
  - `Port 22 (SSH)`: Restricted to `<ADMIN_OFFICE_IP>/32` ONLY (or disabled entirely in favor of AWS Systems Manager Session Manager).
- **CRITICAL RESTRICTION**:
  - **NEVER** expose `Port 1883` (Mosquitto MQTT) or `Port 8086` (InfluxDB) to public interfaces.
  - In `docker-compose.prod.yml`, external port bindings for Mosquitto and InfluxDB are removed (`ports: []`), keeping traffic strictly isolated inside the Docker bridge network.

---

## 2. Infrastructure Setup (AWS CLI)

### A. Allocate Elastic IP
```bash
# Allocate and associate Elastic IP for static hangar endpoints
ALLOC_ID=$(aws ec2 allocate-address --domain vpc --region ap-south-1 --query 'AllocationId' --output text)
aws ec2 associate-address --instance-id <INSTANCE_ID> --allocation-id $ALLOC_ID --region ap-south-1
```

### B. EBS Snapshot Backup
```bash
# Take EBS snapshot of instance root/data volume
VOLUME_ID=$(aws ec2 describe-instances --instance-ids <INSTANCE_ID> --region ap-south-1 \
  --query "Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId" --output text)

aws ec2 create-snapshot \
  --volume-id $VOLUME_ID \
  --description "TwinEdge Pre-Deployment Golden Snapshot" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Project,Value=TwinEdge},{Key=Env,Value=Production}]' \
  --region ap-south-1
```

### C. AWS Budget Alert ($15/month Threshold)
```bash
aws budgets create-budget \
  --account-id <AWS_ACCOUNT_ID> \
  --budget '{
    "BudgetName": "TwinEdge-Monthly-Limit",
    "BudgetLimit": { "Amount": "15", "Unit": "USD" },
    "CostTypes": { "IncludeTax": true, "IncludeSubscription": true, "UseBlended": false },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{ "SubscriptionType": "EMAIL", "Address": "admin@yourdomain.com" }]
  }]'
```

### D. Automated Cost-Saving Shutdown
To prevent runaway billing after test runs:
```bash
# Stop instance command
aws ec2 stop-instances --instance-ids <INSTANCE_ID> --region ap-south-1
```

---

## 3. Host Provisioning & Application Launch

1. **Connect via AWS SSM (No public SSH key needed)**:
   ```bash
   aws ssm start-session --target <INSTANCE_ID> --region ap-south-1
   ```

2. **Clone repository and configure production environment**:
   ```bash
   git clone https://github.com/saran612/TwinEdge.git /opt/twinedge
   cd /opt/twinedge
   cp .env.example .env
   # Edit .env with secure random tokens
   sed -i "s/replace_with_influxdb_admin_token/$(openssl rand -hex 24)/g" .env
   sed -i "s/replace_with_secure_password/$(openssl rand -hex 16)/g" .env
   ```

3. **Start Production Stack with Caddy & HTTPS**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```

4. **Verify Health**:
   ```bash
   ./deploy/smoke_test.sh
   ```
