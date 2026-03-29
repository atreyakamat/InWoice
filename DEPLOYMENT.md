# InWoice Deployment Guide

## 🚀 Production Deployment Checklist

### 1. Security Configuration

#### ✅ **Change Default Password**
```bash
# Generate a secure password hash
curl -X POST http://localhost:5000/api/auth/hash-password \
  -H "Content-Type: application/json" \
  -d '{"password":"your-strong-password-here"}'

# Add to .env
ADMIN_PASSWORD_HASH=$2a$10$... # Use the hash from above
# Remove or comment out ADMIN_PASSWORD if using hash
```

#### ✅ **Generate JWT Secret**
```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
$bytes = New-Object byte[] 32
[Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Add to `.env`:
```
JWT_SECRET=<generated-secret-here>
```

#### ✅ **Configure CORS**
Set your production frontend URL:
```
FRONTEND_URL=https://yourdomain.com
```

#### ✅ **Set NODE_ENV**
```
NODE_ENV=production
```

---

### 2. Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=production

# Authentication (CRITICAL - Change these!)
ADMIN_PASSWORD_HASH=<your-bcrypt-hash>
JWT_SECRET=<your-random-secret>
JWT_EXPIRES_IN=24h

# Frontend URL for CORS
FRONTEND_URL=https://yourinvoice.app

# Logging
LOG_LEVEL=info

# AI Configuration (Optional)
USE_OLLAMA_AI=false
OLLAMA_URL=http://localhost:11434/api/chat
OLLAMA_MODEL=qwen2.5:1.5b

USE_LOCAL_PYTHON_AI=true
LOCAL_AI_URL=http://127.0.0.1:8000/parse

GEMINI_API_KEY=your_gemini_api_key_here

# Google Sheets (Optional)
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id

# SMTP Email (Optional - can be configured via UI)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

Frontend `.env` (create in `frontend/` directory):
```env
REACT_APP_API_URL=https://api.yourinvoice.app
```

---

### 3. Docker Deployment

#### **Build and Run with Docker Compose**

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### **Production Docker Compose**

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
    env_file:
      - ./backend/.env
    volumes:
      - ./backend/database.json:/app/database.json
      - ./backend/backups:/app/backups
      - ./backend/logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    environment:
      - NODE_ENV=production
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped

  local-ai:
    build:
      context: ./local_ai
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    restart: unless-stopped
```

Run with:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

### 4. Manual Deployment (Without Docker)

#### **Backend Setup**

```bash
cd backend

# Install dependencies
npm install --production

# Run database migrations if any
# (Currently using JSON, no migrations needed)

# Start server with PM2 (process manager)
npm install -g pm2
pm2 start server.js --name inwoice-backend
pm2 save
pm2 startup
```

#### **Frontend Setup**

```bash
cd frontend

# Install dependencies
npm install

# Build for production
npm run build

# Serve with nginx or serve
npm install -g serve
serve -s build -p 3000
```

---

### 5. HTTPS/SSL Setup

#### **Option 1: Nginx Reverse Proxy**

Install Nginx:
```bash
sudo apt-get install nginx
```

Create `/etc/nginx/sites-available/inwoice`:
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
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/inwoice /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### **Option 2: Let's Encrypt SSL**

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

### 6. Backup Strategy

#### **Automated Backups**

The backend includes automated daily backups (configured in code with node-cron).

Manual backup:
```bash
# Backup database
cp backend/database.json backend/backups/database-$(date +%Y-%m-%d).json

# Backup with tar
tar -czf inwoice-backup-$(date +%Y-%m-%d).tar.gz \
  backend/database.json \
  backend/.env \
  backend/logs
```

#### **Restore from Backup**

```bash
# Restore database
cp backend/backups/database-2026-03-28.json backend/database.json

# Restart services
docker-compose restart
# OR
pm2 restart inwoice-backend
```

---

### 7. Monitoring

#### **Health Check**

Check if services are running:
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-03-28T17:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

#### **Log Monitoring**

```bash
# Docker
docker-compose logs -f backend

# PM2
pm2 logs inwoice-backend

# Log files
tail -f backend/logs/combined.log
tail -f backend/logs/error.log
```

---

### 8. Performance Optimization

#### **Backend**

- Enable Node.js clustering for multi-core usage
- Use Redis for caching (future improvement)
- Implement CDN for static assets

#### **Frontend**

- Enable gzip compression in Nginx
- Implement service worker for offline support
- Lazy load routes and components

---

### 9. Security Best Practices

✅ **Completed:**
- JWT authentication with bcrypt password hashing
- Rate limiting on API endpoints
- CORS restricted to specific origins
- Helmet.js for security headers
- Input validation with Zod
- Error handling without exposing stack traces

🔄 **Recommended:**
- Enable HTTPS (see section 5)
- Regular dependency updates (`npm audit`)
- Firewall configuration (UFW/iptables)
- Regular backups (automated)
- Two-factor authentication (future feature)

---

### 10. Troubleshooting

#### **Backend won't start**

```bash
# Check logs
cat backend/logs/error.log

# Verify environment variables
node -e "require('dotenv').config(); console.log(process.env.JWT_SECRET)"

# Check port availability
lsof -i :5000
```

#### **Frontend can't connect to backend**

- Verify `REACT_APP_API_URL` in frontend `.env`
- Check CORS configuration in backend
- Verify backend is running: `curl http://localhost:5000/health`

#### **Authentication fails**

- Verify JWT_SECRET is set
- Check token in browser localStorage
- Generate new password hash if needed

#### **Database corruption**

```bash
# Restore from backup
cp backend/backups/database-latest.json backend/database.json

# Verify JSON structure
node -e "console.log(JSON.parse(require('fs').readFileSync('backend/database.json')))"
```

---

### 11. Scaling Considerations

For production with high traffic:

1. **Load Balancer**: Use Nginx or HAProxy
2. **Database**: Migrate from JSON to PostgreSQL/MongoDB
3. **Caching**: Implement Redis for sessions and data
4. **CDN**: Use Cloudflare for static assets
5. **Monitoring**: Set up Prometheus + Grafana
6. **Alerting**: Configure alerts for downtime

---

## 📞 Support

For issues or questions:
- Check logs first: `backend/logs/`
- Review environment variables
- Verify all services are running
- Check firewall and network settings

---

**Version:** 1.0.0  
**Last Updated:** March 2026
