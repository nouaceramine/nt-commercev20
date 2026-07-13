#!/bin/bash
# NT Commerce - Complete VPS Installation Script
# Run this script on your Hostinger VPS via Terminal
# Tested on: Ubuntu 22.04 LTS

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="168.231.81.154"  # Replace with your domain if you have one
EMAIL="admin@ntcommerce.local"
REPO_URL="https://github.com/nouaceramine/Nt-commerce17.git"
INSTALL_DIR="/opt/ntcommerce"

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run this script as root (use: sudo bash install-ntcommerce.sh)"
    exit 1
fi

info "=========================================="
info "  NT Commerce - VPS Installation Script"
info "  Target: Ubuntu 22.04 LTS"
info "=========================================="
echo ""

# Step 1: System Update
info "Step 1/10: Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    curl \
    wget \
    git \
    ufw \
    nginx \
    certbot \
    python3-certbot-nginx \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    htop \
    vim \
    unzip \
    net-tools \
    fail2ban \
    logrotate

log "System packages updated successfully"

# Step 2: Install/Verify Docker
info "Step 2/10: Installing Docker..."
if ! command -v docker &> /dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl start docker
    systemctl enable docker
    log "Docker installed successfully"
else
    log "Docker already installed: $(docker --version)"
fi

# Ensure docker daemon is running
if ! systemctl is-active --quiet docker; then
    warn "Docker daemon not running, attempting to start..."
    systemctl start docker
    systemctl enable docker
    sleep 3
    if ! systemctl is-active --quiet docker; then
        error "Failed to start Docker daemon. Trying alternative approach..."
        systemctl restart containerd
        sleep 2
        systemctl start docker
    fi
fi

if systemctl is-active --quiet docker; then
    log "Docker daemon is running"
else
    error "Docker daemon could not be started. Please check manually: systemctl status docker"
    exit 1
fi

# Step 3: Install Docker Compose
info "Step 3/10: Verifying Docker Compose..."
if ! docker compose version &> /dev/null; then
    if ! docker-compose --version &> /dev/null; then
        DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep -oP '"tag_name": "\K(.*)(?=")')
        curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
        ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
        log "Docker Compose installed"
    fi
fi

docker network create ntcommerce-network 2>/dev/null || warn "Network already exists"
log "Docker network ready"

# Step 4: Clone Repository
info "Step 4/10: Cloning NT Commerce repository..."
if [ -d "$INSTALL_DIR" ]; then
    warn "Installation directory exists. Backing up..."
    mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%s)"
fi

git clone "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"
log "Repository cloned to $INSTALL_DIR"

# Step 5: Create Environment Configuration
info "Step 5/10: Creating environment configuration..."

MONGO_ROOT_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-25)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-25)
JWT_SECRET=$(openssl rand -base64 48)
SECRET_KEY=$(openssl rand -base64 48)
ENCRYPTION_KEY=$(openssl rand -base64 32)

cat > "$INSTALL_DIR/backend/.env" << 'EOF'
MONGODB_URL=mongodb://root:MONGO_ROOT_PASSWORD@mongodb:27017/ntcommerce?authSource=admin
MONGODB_DB_NAME=ntcommerce
REDIS_URL=redis://:REDIS_PASSWORD@redis:6379/0
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=REDIS_PASSWORD
JWT_SECRET=JWT_SECRET_VALUE
SECRET_KEY=SECRET_KEY_VALUE
ENCRYPTION_KEY=ENCRYPTION_KEY_VALUE
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://FRONTEND_IP
SMTP_PORT=587
FROM_EMAIL=noreply@ntcommerce.local
APP_NAME=NT Commerce
APP_ENV=production
DEBUG=false
LOG_LEVEL=info
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_SIZE=10485760
POS_SESSION_TIMEOUT=3600
CURRENCY_DEFAULT=DZD
CURRENCY_DECIMALS=2
EOF

sed -i "s/MONGO_ROOT_PASSWORD/$MONGO_ROOT_PASSWORD/g" "$INSTALL_DIR/backend/.env"
sed -i "s/REDIS_PASSWORD/$REDIS_PASSWORD/g" "$INSTALL_DIR/backend/.env"
sed -i "s/JWT_SECRET_VALUE/$JWT_SECRET/g" "$INSTALL_DIR/backend/.env"
sed -i "s/SECRET_KEY_VALUE/$SECRET_KEY/g" "$INSTALL_DIR/backend/.env"
sed -i "s/ENCRYPTION_KEY_VALUE/$ENCRYPTION_KEY/g" "$INSTALL_DIR/backend/.env"
sed -i "s/FRONTEND_IP/$DOMAIN/g" "$INSTALL_DIR/backend/.env"

cat > "$INSTALL_DIR/frontend/.env" << EOF
REACT_APP_API_URL=http://$DOMAIN:8000
REACT_APP_WS_URL=ws://$DOMAIN:8000
REACT_APP_APP_NAME=NT Commerce
REACT_APP_CURRENCY=DZD
REACT_APP_LOCALE=fr-DZ
EOF

log "Environment files created"

# Step 6: Create Docker Compose
info "Step 6/10: Creating Docker Compose configuration..."
cat > "$INSTALL_DIR/docker-compose.yml" << EOF
version: '3.8'

services:
  mongodb:
    image: mongo:7.0
    container_name: ntcommerce-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: $MONGO_ROOT_PASSWORD
      MONGO_INITDB_DATABASE: ntcommerce
    volumes:
      - mongodb_data:/data/db
      - ./backend/init-mongo.js:/docker-entrypoint-initdb.d/init-mongo.js:ro
    ports:
      - "127.0.0.1:27017:27017"
    networks:
      - ntcommerce-network
    healthcheck:
      test: echo 'db.runCommand(\"ping\").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 10s
      retries: 5
      start_period: 40s

  redis:
    image: redis:7-alpine
    container_name: ntcommerce-redis
    restart: unless-stopped
    command: redis-server --requirepass $REDIS_PASSWORD
    volumes:
      - redis_data:/data
    ports:
      - "127.0.0.1:6379:6379"
    networks:
      - ntcommerce-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: ntcommerce-backend
    restart: unless-stopped
    env_file:
      - ./backend/.env
    volumes:
      - backend_uploads:/app/uploads
      - ./backend/logs:/app/logs
    ports:
      - "8000:8000"
    networks:
      - ntcommerce-network
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - REACT_APP_API_URL=http://$DOMAIN:8000
    container_name: ntcommerce-frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    networks:
      - ntcommerce-network
    depends_on:
      - backend

volumes:
  mongodb_data:
  redis_data:
  backend_uploads:

networks:
  ntcommerce-network:
    external: true
EOF

log "Docker Compose file created"

# Step 7: Create Dockerfiles
info "Step 7/10: Creating Dockerfiles..."
cat > "$INSTALL_DIR/backend/Dockerfile" << 'EOF'
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /app/uploads /app/logs

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
EOF

cat > "$INSTALL_DIR/frontend/Dockerfile" << 'EOF'
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF

cat > "$INSTALL_DIR/frontend/nginx.conf" << 'EOF'
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF

cat > "$INSTALL_DIR/backend/init-mongo.js" << 'EOF'
db = db.getSiblingDB('ntcommerce');

db.createUser({
    user: 'ntcommerce_app',
    pwd: 'ntcommerce_app_password',
    roles: [
        { role: 'readWrite', db: 'ntcommerce' },
        { role: 'dbAdmin', db: 'ntcommerce' }
    ]
});

db.createCollection('users');
db.createCollection('products');
db.createCollection('orders');
db.createCollection('stores');
db.createCollection('categories');
db.createCollection('customers');
db.createCollection('transactions');
db.createCollection('inventory');
db.createCollection('settings');

db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "store_id": 1 });
db.products.createIndex({ "sku": 1 }, { unique: true });
db.products.createIndex({ "store_id": 1 });
db.orders.createIndex({ "order_number": 1 }, { unique: true });
db.orders.createIndex({ "store_id": 1, "created_at": -1 });
db.stores.createIndex({ "subdomain": 1 }, { unique: true });

print('Database initialized successfully');
EOF

log "Dockerfiles and configurations created"

# Step 8: Configure Firewall
info "Step 8/10: Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 8000/tcp comment 'NT Commerce API'
ufw allow 3000/tcp comment 'NT Commerce Frontend'
ufw --force enable

log "Firewall configured"

# Step 9: Configure Nginx
info "Step 9/10: Configuring Nginx reverse proxy..."
cat > /etc/nginx/sites-available/ntcommerce << EOF
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 50M;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
    
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 80 default_server;
    server_name _;
    return 444;
}
EOF

ln -sf /etc/nginx/sites-available/ntcommerce /etc/nginx/sites-enabled/ntcommerce
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx

log "Nginx configured"

# Step 10: Build and Start Services
info "Step 10/10: Building and starting NT Commerce services..."
cd "$INSTALL_DIR"

info "Building Docker images (this may take 10-15 minutes)..."
docker compose pull 2>/dev/null || true
docker compose build --no-cache

info "Starting services..."
docker compose up -d

info "Waiting for services to start..."
sleep 30

echo ""
info "Service Status:"
docker compose ps

# Setup Fail2ban
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log
EOF

systemctl restart fail2ban
systemctl enable fail2ban

# Create systemd service
cat > /etc/systemd/system/ntcommerce.service << EOF
[Unit]
Description=NT Commerce Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ntcommerce.service

# Create backup script
cat > "$INSTALL_DIR/backup.sh" << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/ntcommerce"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
docker exec ntcommerce-mongodb mongodump --host localhost --out /tmp/backup_$DATE
mkdir -p "$BACKUP_DIR/mongo_$DATE"
docker cp ntcommerce-mongodb:/tmp/backup_$DATE "$BACKUP_DIR/mongo_$DATE"
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C /opt/ntcommerce backend/uploads
find "$BACKUP_DIR" -type d -mtime +7 -exec rm -rf {} + 2>/dev/null
find "$BACKUP_DIR" -type f -mtime +7 -delete 2>/dev/null
echo "Backup completed: $BACKUP_DIR"
EOF
chmod +x "$INSTALL_DIR/backup.sh"

# Add daily backup cron
(crontab -l 2>/dev/null; echo "0 2 * * * $INSTALL_DIR/backup.sh >> /var/log/ntcommerce-backup.log 2>&1") | crontab -

# Log rotation
cat > /etc/logrotate.d/ntcommerce << EOF
/var/log/ntcommerce*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    create 0644 root root
}
EOF

# Save credentials
cat > "$INSTALL_DIR/.credentials" << EOF
# NT Commerce - Generated Credentials
# Generated on: $(date)
# KEEP THIS FILE SECURE!

MongoDB Root Password: $MONGO_ROOT_PASSWORD
Redis Password: $REDIS_PASSWORD
JWT Secret: $JWT_SECRET
Secret Key: $SECRET_KEY
Encryption Key: $ENCRYPTION_KEY

Admin Panel: http://$DOMAIN:3000
API Endpoint: http://$DOMAIN:8000

# Commands:
# Logs:   cd $INSTALL_DIR && docker compose logs -f
# Restart: cd $INSTALL_DIR && docker compose restart
# Backup: $INSTALL_DIR/backup.sh
EOF

chmod 600 "$INSTALL_DIR/.credentials"

echo ""
echo "============================================================"
echo -e "${GREEN}  ✅ NT Commerce Installation Complete!${NC}"
echo "============================================================"
echo ""
echo -e "${BLUE}  📍 Access URLs:${NC}"
echo "     • Frontend: http://$DOMAIN:3000"
echo "     • API:      http://$DOMAIN:8000"
echo ""
echo -e "${BLUE}  📁 Installation Directory:${NC}"
echo "     $INSTALL_DIR"
echo ""
echo -e "${BLUE}  🔐 Credentials saved to:${NC}"
echo "     $INSTALL_DIR/.credentials"
echo ""
echo -e "${BLUE}  🛠️  Commands:${NC}"
echo "     Logs:    cd $INSTALL_DIR && docker compose logs -f"
echo "     Restart: cd $INSTALL_DIR && docker compose restart"
echo "     Stop:    cd $INSTALL_DIR && docker compose down"
echo "     Backup:  $INSTALL_DIR/backup.sh"
echo "     Update:  cd $INSTALL_DIR && git pull && docker compose up -d --build"
echo ""
echo -e "${YELLOW}  ⚠️  IMPORTANT:${NC}"
echo "     1. Change default credentials after first login"
echo "     2. Configure domain DNS to point to $DOMAIN"
echo "     3. Run 'certbot --nginx' after DNS for SSL"
echo ""
echo -e "${GREEN}  Thank you for choosing NT Commerce! 🚀${NC}"
echo "============================================================"
