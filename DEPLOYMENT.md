# دليل النشر - NT Commerce Deployment Guide

## 📋 المتطلبات الأساسية

### متطلبات الخادم
- **CPU**: 2 cores minimum
- **RAM**: 4GB minimum (8GB recommended)
- **Storage**: 20GB SSD
- **OS**: Ubuntu 22.04 LTS / Debian 11+

### البرمجيات المطلوبة
- Docker & Docker Compose
- Nginx (للـ reverse proxy)
- SSL Certificate (Let's Encrypt)

---

## 🐳 النشر باستخدام Docker

### 1. إنشاء docker-compose.yml

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6
    container_name: ntcommerce-mongo
    restart: always
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    networks:
      - ntcommerce-network

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: ntcommerce-backend
    restart: always
    ports:
      - "8001:8001"
    environment:
      - MONGO_URL=mongodb://admin:${MONGO_PASSWORD}@mongodb:27017
      - DB_NAME=ntcommerce
      - JWT_SECRET=${JWT_SECRET}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - SENDGRID_API_KEY=${SENDGRID_API_KEY}
    depends_on:
      - mongodb
    networks:
      - ntcommerce-network

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: ntcommerce-frontend
    restart: always
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_BACKEND_URL=${BACKEND_URL}
    networks:
      - ntcommerce-network

volumes:
  mongo_data:

networks:
  ntcommerce-network:
    driver: bridge
```

### 2. Dockerfile للـ Backend

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8001

# Run the application
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
```

### 3. Dockerfile للـ Frontend

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source and build
COPY . .
RUN yarn build

# Production image
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

### 4. تشغيل Docker Compose

```bash
# إنشاء ملف .env
cp .env.example .env
nano .env  # تعديل المتغيرات

# بناء وتشغيل
docker-compose up -d --build

# التحقق من الحالة
docker-compose ps
docker-compose logs -f
```

---

## 🔒 إعداد SSL مع Nginx

### nginx.conf

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /static {
        proxy_pass http://localhost:8001/static;
    }
}
```

### تثبيت SSL

```bash
# تثبيت Certbot
sudo apt install certbot python3-certbot-nginx

# الحصول على شهادة
sudo certbot --nginx -d yourdomain.com

# تجديد تلقائي
sudo certbot renew --dry-run
```

---

## 📊 المراقبة والصيانة

### سجلات التطبيق

```bash
# عرض سجلات Backend
docker-compose logs -f backend

# عرض سجلات Frontend
docker-compose logs -f frontend

# عرض سجلات MongoDB
docker-compose logs -f mongodb
```

### النسخ الاحتياطي

```bash
# نسخ احتياطي لقاعدة البيانات
docker exec ntcommerce-mongo mongodump \
    --username admin \
    --password $MONGO_PASSWORD \
    --out /backup/$(date +%Y%m%d)

# نسخ من الحاوية
docker cp ntcommerce-mongo:/backup ./backups/
```

### التحديثات

```bash
# سحب آخر التغييرات
git pull origin main

# إعادة بناء ونشر
docker-compose down
docker-compose up -d --build

# تنظيف الصور القديمة
docker image prune -f
```

---

## ⚙️ متغيرات البيئة المطلوبة

| المتغير | الوصف | مثال |
|---------|-------|------|
| `MONGO_URL` | رابط MongoDB | `mongodb://user:pass@host:27017` |
| `DB_NAME` | اسم قاعدة البيانات | `ntcommerce` |
| `JWT_SECRET` | مفتاح JWT | `random-secure-string` |
| `STRIPE_SECRET_KEY` | مفتاح Stripe | `sk_live_...` |
| `SENDGRID_API_KEY` | مفتاح SendGrid | `SG...` |
| `BACKEND_URL` | رابط Backend | `https://api.yourdomain.com` |

---

## 🔧 استكشاف الأخطاء

### مشاكل شائعة

1. **خطأ في الاتصال بـ MongoDB**
   ```bash
   docker-compose logs mongodb
   # تأكد من صحة MONGO_URL
   ```

2. **خطأ 502 Bad Gateway**
   ```bash
   # تأكد من أن Backend يعمل
   docker-compose ps
   curl http://localhost:8001/health
   ```

3. **مشاكل CORS**
   ```bash
   # تأكد من إعدادات CORS في Backend
   # وأن REACT_APP_BACKEND_URL صحيح
   ```

---

## 📞 الدعم

للمساعدة في النشر، تواصل معنا:
- 📧 support@ntcommerce.com
