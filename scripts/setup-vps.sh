#!/bin/bash
# NT Commerce - VPS Setup Script
# Run this once on a fresh Ubuntu 22.04 VPS
# Usage: bash setup-vps.sh

set -e

REPO_URL="https://github.com/nouaceramine/nt-commerce.git"
APP_DIR="/var/www/nt-commerce"
DOMAIN=""  # ضع هنا اسم النطاق إن كان لديك، أو اتركه فارغاً للـ IP

echo "🚀 Installing dependencies..."
apt update -y && apt upgrade -y
apt install -y python3 python3-pip python3-venv git nginx curl

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g yarn

# MongoDB 7
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update -y && apt install -y mongodb-org
systemctl start mongod && systemctl enable mongod

echo "📦 Cloning project..."
mkdir -p /var/www
git clone $REPO_URL $APP_DIR
cd $APP_DIR

echo "🐍 Installing Python packages..."
cd backend && pip3 install -r requirements.txt
cd $APP_DIR

echo "⚛️ Building frontend..."
cd frontend && yarn install && yarn build
cd $APP_DIR

echo "⚙️ Creating backend systemd service..."
cat > /etc/systemd/system/nt-backend.service << EOF
[Unit]
Description=NT Commerce Backend
After=network.target mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR/backend
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl start nt-backend
systemctl enable nt-backend

echo "🌐 Configuring Nginx..."
SERVER_NAME=${DOMAIN:-$(curl -s ifconfig.me)}
cat > /etc/nginx/sites-available/nt-commerce << EOF
server {
    listen 80;
    server_name $SERVER_NAME;

    root $APP_DIR/frontend/build;
    index index.html;

    location / {
        try_files \$uri /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 300;
    }

    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -sf /etc/nginx/sites-available/nt-commerce /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo ""
echo "✅ Setup complete!"
echo "🌐 Your app is running at: http://$SERVER_NAME"
echo ""
echo "Next steps:"
echo "  1. Add GitHub Secrets (VPS_HOST, VPS_USER, VPS_SSH_KEY)"
echo "  2. Every 'git push' from Replit will auto-deploy"
