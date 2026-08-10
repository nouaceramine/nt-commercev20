# NT Commerce - VPS Deployment Guide

## 🚀 Quick Start (Automated)

Run this single command in your Hostinger VPS Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/nouaceramine/Nt-commerce17/main/deploy/install-ntcommerce.sh | sudo bash
```

---

## 📋 Manual Step-by-Step Installation

### Step 1: System Update
```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2: Install Docker
```bash
sudo apt remove docker docker-engine docker.io containerd runc 2>/dev/null
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl start docker
sudo systemctl enable docker
sudo docker --version
```

### Step 3: Clone Repository
```bash
cd /opt
sudo git clone https://github.com/nouaceramine/Nt-commerce17.git ntcommerce
cd ntcommerce
```

### Step 4: Configure Environment
```bash
cd backend
sudo nano .env
```

Paste this (replace passwords):
```env
MONGODB_URL=mongodb://root:YOUR_MONGO_PASSWORD@mongodb:27017/ntcommerce?authSource=admin
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@redis:6379/0
JWT_SECRET=your-jwt-secret-here
SECRET_KEY=your-secret-key-here
ALLOWED_ORIGINS=http://localhost:3000,http://168.231.81.154
```

```bash
cd ../frontend
sudo nano .env
```

Paste this:
```env
REACT_APP_API_URL=http://168.231.81.154:8000
REACT_APP_APP_NAME=NT Commerce
```

### Step 5: Build and Start
```bash
cd /opt/ntcommerce
sudo docker compose up -d --build
```

### Step 6: Check Status
```bash
sudo docker compose ps
sudo docker compose logs -f
```

---

## 🔧 Post-Installation

### Configure Firewall
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8000/tcp
sudo ufw allow 3000/tcp
sudo ufw enable
```

### Setup SSL (After pointing domain)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 📊 Monitoring Commands

```bash
# View all logs
cd /opt/ntcommerce && sudo docker compose logs -f

# View specific service
cd /opt/ntcommerce && sudo docker compose logs -f backend

# Container stats
sudo docker stats

# Restart services
cd /opt/ntcommerce && sudo docker compose restart

# Stop all
cd /opt/ntcommerce && sudo docker compose down

# Update application
cd /opt/ntcommerce && git pull && sudo docker compose up -d --build
```
