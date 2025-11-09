# Pre-Release Checklist

**Version**: v0.6.2
**Date**: 2025-11-09
**Branch**: feature/dashboard-refresh-fix
**Release Manager**: Development Team

---

## Overview

This checklist ensures code quality, documentation accuracy, and production readiness before pushing to version control.

**Status Legend**:
- ✅ Complete
- ⏳ In Progress
- ⚠️ Needs Attention
- ❌ Failed/Blocked

---

## 1. Code Quality

### 1.1 Frontend (Next.js)
- [ ] No TypeScript errors (`cd frontend && npm run build`)
- [ ] No ESLint warnings (`npm run lint`)
- [ ] No console.log statements in production code
- [ ] All React hooks dependencies correct
- [ ] No unused imports or variables
- [ ] Prisma client generated (`npx prisma generate`)
- [ ] Environment variables documented in `.env.example`

### 1.2 Worker (Python)
- [ ] No Python syntax errors
- [ ] No unused imports
- [ ] All type hints present (where applicable)
- [ ] Logging statements use proper levels (DEBUG, INFO, WARN, ERROR)
- [ ] Exception handling complete
- [ ] No hardcoded secrets or IPs (use environment variables)
- [ ] Requirements.txt up to date

### 1.3 Docker
- [ ] All services build successfully (`docker compose build`)
- [ ] All services start correctly (`docker compose up`)
- [ ] Health checks pass for all services (`docker compose ps`)
- [ ] No dangling volumes or containers
- [ ] docker-compose.yml uses pinned image versions (where applicable)

---

## 2. Functionality Testing

### 2.1 Core Features
- [ ] **Dashboard**: Loads without errors, shows current statistics
- [ ] **Discovery**: Can scan BACnet network, finds devices
- [ ] **Points**: Can view, filter, and edit points
- [ ] **Monitoring**: Real-time MQTT data streaming works
- [ ] **Settings**: Can update settings, changes persist
- [ ] **Write Commands**: Can write to BACnet points, results shown

### 2.2 Data Flow
- [ ] BACnet polling works (check worker logs)
- [ ] MQTT publishing works (check broker with `mosquitto_sub`)
- [ ] Database updates correctly (check PostgreSQL)
- [ ] Frontend reflects real-time changes
- [ ] SSE connection remains stable for 5+ minutes
- [ ] No memory leaks (check `docker stats` after 30 minutes)

### 2.3 Error Handling
- [ ] Graceful handling of MQTT broker down
- [ ] Graceful handling of BACnet device offline
- [ ] Graceful handling of database connection loss
- [ ] User-friendly error messages in UI
- [ ] Worker auto-restarts on crash (Docker health check)

### 2.4 Edge Cases
- [ ] Empty database (first-time startup)
- [ ] No devices discovered
- [ ] No points enabled for MQTT
- [ ] Network disconnection during write command
- [ ] Invalid user input in forms

---

## 3. Database

### 3.1 Schema
- [ ] Migrations apply cleanly (`npx prisma migrate deploy`)
- [ ] No pending schema changes (`npx prisma migrate status`)
- [ ] Prisma schema matches actual database
- [ ] All foreign keys enforced
- [ ] Indexes present on frequently queried columns

### 3.2 Data Integrity
- [ ] No orphaned records
- [ ] Default values set correctly
- [ ] Constraints working (unique, not null)
- [ ] Timestamps auto-updating
- [ ] Test data cleaned up (if any)

### 3.3 Backup & Restore
- [ ] Database can be backed up (`pg_dump` command documented)
- [ ] Database can be restored from backup
- [ ] Seed script works (`npx prisma db seed`)
- [ ] Migration rollback works (if needed)

---

## 4. Security

### 4.1 Credentials
- [ ] No hardcoded passwords in code
- [ ] No API keys committed to git
- [ ] `.env` file gitignored
- [ ] `.env.example` provided with dummy values
- [ ] Database passwords not in docker-compose.yml (use env vars)

### 4.2 Dependencies
- [ ] No critical vulnerabilities (`npm audit` in frontend)
- [ ] No outdated packages with known CVEs
- [ ] Python packages from trusted sources
- [ ] Docker base images from official registries

### 4.3 Network Security
- [ ] PostgreSQL not exposed to public network (only localhost:5434)
- [ ] MQTT broker access controlled (internal network only)
- [ ] No unnecessary ports exposed in docker-compose.yml

---

## 5. Documentation

### 5.1 User Documentation
- [ ] **README.md**: Up to date, accurate instructions
- [ ] **Quick Start**: Tested on fresh environment
- [ ] **API Documentation**: All endpoints documented
- [ ] **Troubleshooting**: Common issues covered
- [ ] **Configuration**: All settings explained
- [ ] **Screenshots**: Current UI screenshots (if needed)

### 5.2 Developer Documentation
- [ ] **CLAUDE.md**: Project context accurate
- [ ] **CHANGELOG.md**: All changes documented for this release
- [ ] **Architecture diagrams**: Match current implementation
- [ ] **Code comments**: Complex logic explained
- [ ] **TODO comments**: Tracked or removed

### 5.3 Legacy Documentation
- [ ] **MONITORING_PAGE_PLAN.md**: Archived or updated (feature complete)
- [ ] **STRATEGIC_PLAN.md**: Milestones updated
- [ ] **RELEASE_NOTES_v0.6.0.md**: Superseded by CHANGELOG

---

## 6. Git & Version Control

### 6.1 Repository Cleanliness
- [ ] `.gitignore` comprehensive (see Section 7.2)
- [ ] No large files committed (>1MB)
- [ ] No database dumps or backups in git
- [ ] No node_modules or __pycache__ in git
- [ ] No .env files in git
- [ ] No temporary files (.swp, .tmp, .bak)

### 6.2 Commit Quality
- [ ] Meaningful commit messages
- [ ] Related changes grouped in single commit
- [ ] No "WIP" or "temp" commits in release branch
- [ ] All commits signed (if policy requires)

### 6.3 Branch Management
- [ ] Working on feature branch (not main)
- [ ] Branch name descriptive (`feature/dashboard-refresh-fix`)
- [ ] No merge conflicts
- [ ] Up to date with main/develop branch

---

## 7. File System Checks

### 7.1 No Sensitive Files
```bash
# Run these checks:
find . -name "*.env" -not -path "*/.env.example"
find . -name "*.pem" -o -name "*.key"
find . -name "*credentials*" -o -name "*secrets*"
find . -type f -size +10M  # Large files
```

- [ ] No .env files (except .env.example)
- [ ] No SSL certificates or keys
- [ ] No credential files
- [ ] No files >10MB

### 7.2 Gitignore Coverage
- [ ] Virtual environments ignored (bac0_env/, venv/)
- [ ] Node modules ignored (node_modules/)
- [ ] Build artifacts ignored (.next/, dist/, build/)
- [ ] Database volumes ignored (postgres_data/, timescaledb_data/)
- [ ] Logs ignored (logs/, *.log)
- [ ] IDE files ignored (.vscode/, .idea/)
- [ ] OS files ignored (.DS_Store, Thumbs.db)
- [ ] Temporary files ignored (tmp/, temp/, *.tmp)
- [ ] Backup files ignored (*.bak, *.backup)

---

## 8. Performance

### 8.1 Resource Usage
- [ ] Frontend bundle size <5MB
- [ ] Docker images reasonably sized (<1GB each)
- [ ] Database queries optimized (no N+1 queries)
- [ ] No memory leaks (monitor for 1 hour)
- [ ] CPU usage <50% during normal operation

### 8.2 Response Times
- [ ] Dashboard loads <2 seconds
- [ ] API responses <500ms
- [ ] MQTT messages processed <100ms
- [ ] BACnet reads <5 seconds per device
- [ ] Write commands execute <10 seconds

### 8.3 Scalability
- [ ] Handles 100+ points without lag
- [ ] Supports 10+ concurrent users (for monitoring page)
- [ ] Database size manageable (document growth rate)

---

## 9. Deployment Readiness

### 9.1 Fresh Install Test
```bash
# Test on clean environment:
rm -rf node_modules .next postgres_data
docker compose down -v
docker compose up --build
```

- [ ] Fresh install completes without errors
- [ ] Database migrations apply automatically
- [ ] Seed data loads correctly (if applicable)
- [ ] All services start in correct order (depends_on working)
- [ ] Health checks pass after startup

### 9.2 Configuration
- [ ] Default values work out-of-the-box
- [ ] Environment variable substitution works
- [ ] Settings page reflects current configuration
- [ ] Configuration changes persist across restarts

### 9.3 Upgrade Path
- [ ] Existing installations can upgrade (test with v0.6.1)
- [ ] Data migration works (if schema changed)
- [ ] No breaking API changes (or documented)

---

## 10. Final Checks

### 10.1 Manual Testing
- [ ] Walk through entire user workflow (discovery → config → monitoring → write)
- [ ] Test on different browsers (Chrome, Firefox, Safari)
- [ ] Test on mobile device (responsive design)
- [ ] Test with slow network (throttle to 3G)
- [ ] Test with high latency BACnet devices

### 10.2 Logs Review
```bash
# Check for errors in logs:
docker compose logs | grep -i error
docker compose logs | grep -i warn
docker compose logs | grep -i exception
```

- [ ] No ERROR level logs during normal operation
- [ ] WARN logs justified and documented
- [ ] No stack traces in production logs
- [ ] Logging level appropriate (INFO for production)

### 10.3 Code Review
- [ ] Self-review all changed files
- [ ] Check for commented-out code (remove or explain)
- [ ] Verify all TODOs tracked or resolved
- [ ] Ensure coding standards followed
- [ ] No duplicated code (refactor if needed)

---

## 11. Release Notes

### 11.1 Changelog Updated
- [ ] Version number correct (v0.6.2)
- [ ] Release date accurate
- [ ] All changes categorized (Added, Changed, Fixed, Removed)
- [ ] Breaking changes highlighted
- [ ] Migration notes included (if applicable)

### 11.2 GitHub/Gitea Release
- [ ] Release tag created (v0.6.2)
- [ ] Release notes written
- [ ] Binaries/artifacts attached (if applicable)
- [ ] Installation instructions updated

---

## 12. Post-Release Tasks

### 12.1 Immediate
- [ ] Monitor logs for 1 hour after deployment
- [ ] Verify data collection continues
- [ ] Check for any user-reported issues
- [ ] Update project board/issue tracker

### 12.2 Documentation
- [ ] Update wiki (if applicable)
- [ ] Announce release (team chat, email)
- [ ] Update roadmap with completed milestones

### 12.3 Backup
- [ ] Create database backup before upgrade
- [ ] Tag Docker images for rollback (`docker tag`)
- [ ] Archive old logs

---

## Sign-Off

**Code Quality**: ☐ Approved
**Testing**: ☐ Approved
**Documentation**: ☐ Approved
**Security**: ☐ Approved
**Ready for Release**: ☐ YES / ☐ NO

**Reviewed By**: ___________________
**Date**: ___________________
**Notes**:

---

## Quick Verification Commands

```bash
# 1. Check git status
git status
git diff

# 2. Build and test
cd frontend
npm run build
npm run lint
cd ..

# 3. Docker health
docker compose up --build -d
docker compose ps
docker compose logs --tail=50

# 4. Database check
docker exec -it bacpipes-postgres psql -U anatoli -d bacpipes -c "SELECT COUNT(*) FROM \"Point\";"

# 5. MQTT check
mosquitto_sub -h localhost -p 1884 -t "#" -v -C 5

# 6. Clean up
docker compose down
```

---

**Last Updated**: 2025-11-09
**Template Version**: 1.0
