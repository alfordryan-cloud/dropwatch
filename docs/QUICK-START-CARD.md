# DROPWATCH Quick Start Card
## Print this page and keep it near your computer

---

## 🚀 STARTING DROPWATCH

### Windows:
```
1. Open Command Prompt (search "cmd" in Start)
2. Type: cd C:\dropwatch
3. Type: docker-compose up -d
4. Open browser: http://localhost
```

### Mac:
```
1. Open Terminal
2. Type: cd ~/dropwatch
3. Type: docker-compose up -d
4. Open browser: http://localhost
```

---

## 🛑 STOPPING DROPWATCH

```
cd C:\dropwatch
docker-compose down
```

---

## ⚡ QUICK COMMANDS

| Action | Command |
|--------|---------|
| Start | `docker-compose up -d` |
| Stop | `docker-compose down` |
| Restart | `docker-compose restart` |
| View Logs | `docker-compose logs -f` |
| Check Status | `docker-compose ps` |
| Update | `git pull && docker-compose up -d --build` |

---

## 🎯 BEFORE A DROP

- [ ] Docker is running (whale icon visible)
- [ ] Dashboard loads at http://localhost
- [ ] All profiles show READY status
- [ ] All profiles have health > 70%
- [ ] Target SKUs are added
- [ ] Phone is nearby for alerts
- [ ] System is ARMED (red button)

---

## ⚠️ COMMON FIXES

### Dashboard won't load:
```
docker-compose down
docker-compose up -d
```
Wait 2 minutes, try again.

### Profile stuck on COOLING:
Wait 5 minutes, then click RESET on profile.

### Not getting SMS alerts:
Check Twilio has credits at twilio.com

### Login failures:
Log into retailer manually first, complete any verification.

---

## 📱 ALERT CHANNELS

| Alert | Meaning |
|-------|---------|
| 🔵 DROP | Product went LIVE - attempting purchase |
| ✅ SUCCESS | Purchase completed! |
| ❌ FAIL | Purchase failed - check logs |
| ⚠️ WARN | Warning - check dashboard |

---

## 🔧 EMERGENCY RESET

If nothing else works:
```
docker-compose down
docker system prune -f
docker-compose up -d --build
```

---

## 📞 SUPPORT

Before calling support, have ready:
1. Screenshot of error
2. Output of: `docker-compose logs --tail 50`
3. What you were trying to do

---

*Keep this card near your computer for quick reference*
