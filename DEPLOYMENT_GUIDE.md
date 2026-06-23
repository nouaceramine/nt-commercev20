# دليل تثبيت NT Commerce على Hostinger VPS (Ubuntu)
# NT Commerce Installation Guide for Hostinger VPS (Ubuntu)

## المتطلبات الأساسية
- Hostinger VPS مع Ubuntu 22.04 أو 24.04
- وصول SSH للسيرفر
- Domain (اختياري لكن مُفضل)

---

## الخطوة 1: الاتصال بالسيرفر

```bash
# من جهازك المحلي
ssh root@YOUR_VPS_IP
# أو
ssh ubuntu@YOUR_VPS_IP
```

---

## الخطوة 2: تحديث النظام

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip software-properties-common
```

---

## الخطوة 3: تثبيت Python 3.11

```bash
# إضافة repository
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update

# تثبيت Python
sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip

# التحقق
python3.11 --version
```

---

## الخطوة 4: تثبيت Node.js 20

```bash
# إضافة NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# تثبيت Node.js
sudo apt install -y nodejs

# تثبيت Yarn
sudo npm install -g yarn

# التحقق
node --version
npm --version
yarn --version
```

---

## الخطوة 5: تثبيت MongoDB

```bash
# استيراد المفتاح العام
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# إضافة repository
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# تثبيت MongoDB
sudo apt update
sudo apt install -y mongodb-org

# تشغيل MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# التحقق
sudo systemctl status mongod
```

---

## الخطوة 6: تثبيت Nginx

```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## الخطوة 7: إنشاء مجلد المشروع

```bash
# إنشاء المجلد
sudo mkdir -p /var/www/ntcommerce
sudo chown -R $USER:$USER /var/www/ntcommerce
cd /var/www/ntcommerce
```

---

## الخطوة 8: تحميل الكود

### الطريقة أ: من GitHub (إذا حفظت الكود)
```bash
git clone https://github.com/YOUR_USERNAME/ntcommerce.git .
```

### الطريقة ب: رفع الملفات يدوياً
```bash
# من جهازك المحلي، استخدم SCP أو SFTP
scp -r /path/to/project/* root@YOUR_VPS_IP:/var/www/ntcommerce/
```

---

## الخطوة 9: إعداد Backend

```bash
cd /var/www/ntcommerce/backend

# إنشاء Virtual Environment
python3.11 -m venv venv
source venv/bin/activate

# تثبيت المتطلبات
pip install --upgrade pip
pip install -r requirements.txt

# إنشاء ملف .env
cat > .env << 'EOF'
MONGO_URL="mongodb://localhost:27017"
DB_NAME="nt_commerce"
CORS_ORIGINS="*"
JWT_SECRET="your-very-secure-secret-key-change-this"
RESEND_API_KEY=""
SENDER_EMAIL=""
STRIPE_API_KEY=""
EOF

# تهيئة قاعدة البيانات
python3.11 scripts/init_production.py
```

---

## الخطوة 10: إعداد Frontend

```bash
cd /var/www/ntcommerce/frontend

# تثبيت المتطلبات
yarn install

# إنشاء ملف .env
cat > .env << 'EOF'
REACT_APP_BACKEND_URL=https://yourdomain.com
EOF

# بناء للإنتاج
yarn build
```

---

## الخطوة 11: إعداد Supervisor (لتشغيل Backend)

```bash
# تثبيت Supervisor
sudo apt install -y supervisor

# إنشاء ملف التكوين
sudo cat > /etc/supervisor/conf.d/ntcommerce.conf << 'EOF'
[program:ntcommerce-backend]
command=/var/www/ntcommerce/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
directory=/var/www/ntcommerce/backend
user=www-data
autostart=true
autorestart=true
stderr_logfile=/var/log/ntcommerce/backend.err.log
stdout_logfile=/var/log/ntcommerce/backend.out.log
environment=PATH="/var/www/ntcommerce/backend/venv/bin"
EOF

# إنشاء مجلد اللوجات
sudo mkdir -p /var/log/ntcommerce
sudo chown -R www-data:www-data /var/log/ntcommerce

# إعادة تحميل Supervisor
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start ntcommerce-backend
```

---

## الخطوة 12: إعداد Nginx

```bash
# إنشاء ملف التكوين
sudo cat > /etc/nginx/sites-available/ntcommerce << 'EOF'
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # أو استخدم IP إذا لم يكن لديك domain
    # server_name YOUR_VPS_IP;

    # Frontend (React build)
    root /var/www/ntcommerce/frontend/build;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Frontend routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Static files
    location /static {
        alias /var/www/ntcommerce/backend/static;
        expires 30d;
    }
}
EOF

# تفعيل الموقع
sudo ln -s /etc/nginx/sites-available/ntcommerce /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# اختبار التكوين
sudo nginx -t

# إعادة تشغيل Nginx
sudo systemctl restart nginx
```

---

## الخطوة 13: إعداد SSL (Let's Encrypt) - اختياري لكن مُفضل

```bash
# تثبيت Certbot
sudo apt install -y certbot python3-certbot-nginx

# الحصول على شهادة SSL
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# التجديد التلقائي (يتم تلقائياً)
sudo certbot renew --dry-run
```

---

## الخطوة 14: إعداد Firewall

```bash
# تفعيل UFW
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# التحقق
sudo ufw status
```

---

## الخطوة 15: التحقق من التثبيت

```bash
# التحقق من الخدمات
sudo systemctl status nginx
sudo systemctl status mongod
sudo supervisorctl status ntcommerce-backend

# اختبار API
curl http://localhost:8001/api/

# اختبار من الخارج
curl http://YOUR_VPS_IP/api/
```

---

## أوامر مفيدة للصيانة

```bash
# إعادة تشغيل Backend
sudo supervisorctl restart ntcommerce-backend

# عرض اللوجات
sudo tail -f /var/log/ntcommerce/backend.err.log
sudo tail -f /var/log/nginx/error.log

# تحديث الكود
cd /var/www/ntcommerce
git pull origin main
cd backend && source venv/bin/activate && pip install -r requirements.txt
cd ../frontend && yarn install && yarn build
sudo supervisorctl restart ntcommerce-backend
```

---

## استكشاف الأخطاء

### مشكلة: Backend لا يعمل
```bash
# التحقق من اللوجات
sudo tail -50 /var/log/ntcommerce/backend.err.log

# إعادة التشغيل
sudo supervisorctl restart ntcommerce-backend
```

### مشكلة: MongoDB لا يعمل
```bash
sudo systemctl status mongod
sudo systemctl restart mongod
sudo tail -50 /var/log/mongodb/mongod.log
```

### مشكلة: الصفحة لا تظهر
```bash
# التحقق من Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo tail -50 /var/log/nginx/error.log
```

---

## بيانات الدخول الافتراضية

- **البريد**: admin@ntcommerce.com
- **كلمة المرور**: Admin@2024

⚠️ **مهم**: غيّر كلمة المرور فوراً بعد أول تسجيل دخول!

---

## الدعم

إذا واجهت أي مشاكل:
1. تحقق من اللوجات أولاً
2. تأكد من أن جميع الخدمات تعمل
3. تحقق من إعدادات Firewall
