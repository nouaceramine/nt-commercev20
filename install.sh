#!/bin/bash

#===============================================================================
# NT Commerce - سكريبت التثبيت التلقائي
# Automatic Installation Script for Hostinger VPS Ubuntu 24.04 LTS
#===============================================================================

set -e

# ألوان للطباعة
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# دالة الطباعة
print_status() {
    echo -e "${BLUE}[*]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_header() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN} $1${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
}

#===============================================================================
# التحقق من الصلاحيات
#===============================================================================
if [ "$EUID" -ne 0 ]; then 
    print_error "يرجى تشغيل السكريبت كـ root"
    print_warning "استخدم: sudo bash install.sh"
    exit 1
fi

#===============================================================================
# جمع المعلومات
#===============================================================================
print_header "NT Commerce - تثبيت تلقائي"

echo "مرحباً! سيقوم هذا السكريبت بتثبيت NT Commerce على سيرفرك."
echo ""

# السؤال عن Domain
read -p "أدخل اسم الدومين (أو اضغط Enter لاستخدام IP): " DOMAIN
if [ -z "$DOMAIN" ]; then
    DOMAIN=$(curl -s ifconfig.me)
    print_warning "سيتم استخدام IP: $DOMAIN"
fi

# السؤال عن GitHub Repository
read -p "أدخل رابط GitHub Repository (أو اضغط Enter للتخطي): " GITHUB_REPO

# السؤال عن SSL
if [ "$DOMAIN" != "$(curl -s ifconfig.me)" ]; then
    read -p "هل تريد تثبيت SSL (Let's Encrypt)? [y/N]: " INSTALL_SSL
else
    INSTALL_SSL="n"
fi

# السؤال عن JWT Secret
read -p "أدخل JWT Secret (أو اضغط Enter لتوليد عشوائي): " JWT_SECRET
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    print_success "تم توليد JWT Secret عشوائي"
fi

echo ""
print_status "بدء التثبيت..."
echo ""

#===============================================================================
# الخطوة 1: تحديث النظام
#===============================================================================
print_header "الخطوة 1: تحديث النظام"

apt update && apt upgrade -y
apt install -y curl wget git unzip software-properties-common build-essential

print_success "تم تحديث النظام"

#===============================================================================
# الخطوة 2: تثبيت Python 3.11
#===============================================================================
print_header "الخطوة 2: تثبيت Python 3.11"

add-apt-repository ppa:deadsnakes/ppa -y
apt update
apt install -y python3.11 python3.11-venv python3.11-dev python3-pip

print_success "Python 3.11 تم تثبيته: $(python3.11 --version)"

#===============================================================================
# الخطوة 3: تثبيت Node.js 20
#===============================================================================
print_header "الخطوة 3: تثبيت Node.js 20"

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g yarn

print_success "Node.js تم تثبيته: $(node --version)"
print_success "Yarn تم تثبيته: $(yarn --version)"

#===============================================================================
# الخطوة 4: تثبيت MongoDB 7.0
#===============================================================================
print_header "الخطوة 4: تثبيت MongoDB 7.0"

curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
    gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Ubuntu 24.04 uses "noble", but MongoDB might not have it yet, use "jammy"
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
    tee /etc/apt/sources.list.d/mongodb-org-7.0.list

apt update
apt install -y mongodb-org

systemctl start mongod
systemctl enable mongod

print_success "MongoDB تم تثبيته وتشغيله"

#===============================================================================
# الخطوة 5: تثبيت Nginx
#===============================================================================
print_header "الخطوة 5: تثبيت Nginx"

apt install -y nginx
systemctl start nginx
systemctl enable nginx

print_success "Nginx تم تثبيته وتشغيله"

#===============================================================================
# الخطوة 6: تثبيت Supervisor
#===============================================================================
print_header "الخطوة 6: تثبيت Supervisor"

apt install -y supervisor
systemctl start supervisor
systemctl enable supervisor

print_success "Supervisor تم تثبيته"

#===============================================================================
# الخطوة 7: إنشاء مجلد المشروع
#===============================================================================
print_header "الخطوة 7: إعداد مجلد المشروع"

mkdir -p /var/www/ntcommerce
cd /var/www/ntcommerce

# تحميل الكود من GitHub إذا تم تحديده
if [ ! -z "$GITHUB_REPO" ]; then
    print_status "جاري تحميل الكود من GitHub..."
    git clone "$GITHUB_REPO" .
    print_success "تم تحميل الكود"
else
    print_warning "لم يتم تحديد GitHub Repository"
    print_warning "يرجى رفع الكود يدوياً إلى /var/www/ntcommerce"
    
    # إنشاء هيكل المجلدات
    mkdir -p backend frontend
fi

#===============================================================================
# الخطوة 8: إعداد Backend
#===============================================================================
print_header "الخطوة 8: إعداد Backend"

cd /var/www/ntcommerce/backend

# إنشاء Virtual Environment
python3.11 -m venv venv
source venv/bin/activate

# تثبيت المتطلبات إذا وجدت
if [ -f "requirements.txt" ]; then
    pip install --upgrade pip
    pip install -r requirements.txt
    print_success "تم تثبيت متطلبات Python"
else
    print_warning "ملف requirements.txt غير موجود"
fi

# إنشاء ملف .env
cat > .env << EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="nt_commerce"
CORS_ORIGINS="*"
JWT_SECRET="$JWT_SECRET"
RESEND_API_KEY=""
SENDER_EMAIL=""
STRIPE_API_KEY=""
EOF

print_success "تم إنشاء ملف .env"

# تهيئة قاعدة البيانات إذا وجد السكريبت
if [ -f "scripts/init_production.py" ]; then
    python3.11 scripts/init_production.py
    print_success "تم تهيئة قاعدة البيانات"
fi

deactivate

#===============================================================================
# الخطوة 9: إعداد Frontend
#===============================================================================
print_header "الخطوة 9: إعداد Frontend"

cd /var/www/ntcommerce/frontend

# إنشاء ملف .env
if [ "$INSTALL_SSL" = "y" ] || [ "$INSTALL_SSL" = "Y" ]; then
    BACKEND_URL="https://$DOMAIN"
else
    BACKEND_URL="http://$DOMAIN"
fi

cat > .env << EOF
REACT_APP_BACKEND_URL=$BACKEND_URL
EOF

# تثبيت المتطلبات وبناء المشروع
if [ -f "package.json" ]; then
    yarn install
    yarn build
    print_success "تم بناء Frontend"
else
    print_warning "ملف package.json غير موجود"
fi

#===============================================================================
# الخطوة 10: إعداد Supervisor
#===============================================================================
print_header "الخطوة 10: إعداد Supervisor"

# إنشاء مجلد اللوجات
mkdir -p /var/log/ntcommerce
chown -R www-data:www-data /var/log/ntcommerce

# إنشاء ملف التكوين
cat > /etc/supervisor/conf.d/ntcommerce.conf << EOF
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

# تعيين الصلاحيات
chown -R www-data:www-data /var/www/ntcommerce

# إعادة تحميل Supervisor
supervisorctl reread
supervisorctl update
supervisorctl start ntcommerce-backend

print_success "تم إعداد Supervisor"

#===============================================================================
# الخطوة 11: إعداد Nginx
#===============================================================================
print_header "الخطوة 11: إعداد Nginx"

cat > /etc/nginx/sites-available/ntcommerce << EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Frontend
    root /var/www/ntcommerce/frontend/build;
    index index.html;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript;

    # Frontend routes
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        client_max_body_size 50M;
    }

    # Static files
    location /static {
        alias /var/www/ntcommerce/backend/static;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# تفعيل الموقع
ln -sf /etc/nginx/sites-available/ntcommerce /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# اختبار وإعادة تشغيل
nginx -t
systemctl restart nginx

print_success "تم إعداد Nginx"

#===============================================================================
# الخطوة 12: تثبيت SSL (اختياري)
#===============================================================================
if [ "$INSTALL_SSL" = "y" ] || [ "$INSTALL_SSL" = "Y" ]; then
    print_header "الخطوة 12: تثبيت SSL"
    
    apt install -y certbot python3-certbot-nginx
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN
    
    print_success "تم تثبيت SSL"
fi

#===============================================================================
# الخطوة 13: إعداد Firewall
#===============================================================================
print_header "الخطوة 13: إعداد Firewall"

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

print_success "تم إعداد Firewall"

#===============================================================================
# الخطوة 14: إنشاء سكريبت التحديث
#===============================================================================
print_header "الخطوة 14: إنشاء سكريبتات مساعدة"

# سكريبت التحديث
cat > /var/www/ntcommerce/update.sh << 'EOF'
#!/bin/bash
cd /var/www/ntcommerce

echo "جاري تحديث الكود..."
git pull origin main

echo "جاري تحديث Backend..."
cd backend
source venv/bin/activate
pip install -r requirements.txt
deactivate

echo "جاري تحديث Frontend..."
cd ../frontend
yarn install
yarn build

echo "جاري إعادة تشغيل الخدمات..."
sudo supervisorctl restart ntcommerce-backend

echo "تم التحديث بنجاح!"
EOF

chmod +x /var/www/ntcommerce/update.sh

# سكريبت عرض الحالة
cat > /var/www/ntcommerce/status.sh << 'EOF'
#!/bin/bash
echo "=== حالة الخدمات ==="
echo ""
echo "MongoDB:"
systemctl status mongod --no-pager | head -5
echo ""
echo "Nginx:"
systemctl status nginx --no-pager | head -5
echo ""
echo "Backend:"
supervisorctl status ntcommerce-backend
echo ""
echo "=== آخر اللوجات ==="
echo ""
echo "Backend Errors (آخر 10 أسطر):"
tail -10 /var/log/ntcommerce/backend.err.log 2>/dev/null || echo "لا توجد أخطاء"
EOF

chmod +x /var/www/ntcommerce/status.sh

print_success "تم إنشاء السكريبتات المساعدة"

#===============================================================================
# انتهاء التثبيت
#===============================================================================
print_header "تم التثبيت بنجاح!"

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}       NT Commerce تم تثبيته بنجاح!            ${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "الموقع: ${BLUE}http://$DOMAIN${NC}"
if [ "$INSTALL_SSL" = "y" ] || [ "$INSTALL_SSL" = "Y" ]; then
    echo -e "الموقع (SSL): ${BLUE}https://$DOMAIN${NC}"
fi
echo ""
echo -e "${YELLOW}بيانات الدخول:${NC}"
echo -e "  البريد: ${GREEN}admin@ntcommerce.com${NC}"
echo -e "  كلمة المرور: ${GREEN}Admin@2024${NC}"
echo ""
echo -e "${RED}⚠️  مهم: غيّر كلمة المرور فوراً بعد أول تسجيل دخول!${NC}"
echo ""
echo -e "${YELLOW}أوامر مفيدة:${NC}"
echo -e "  عرض الحالة: ${BLUE}bash /var/www/ntcommerce/status.sh${NC}"
echo -e "  تحديث الكود: ${BLUE}bash /var/www/ntcommerce/update.sh${NC}"
echo -e "  إعادة تشغيل Backend: ${BLUE}sudo supervisorctl restart ntcommerce-backend${NC}"
echo -e "  عرض اللوجات: ${BLUE}tail -f /var/log/ntcommerce/backend.err.log${NC}"
echo ""
echo -e "${GREEN}================================================${NC}"
