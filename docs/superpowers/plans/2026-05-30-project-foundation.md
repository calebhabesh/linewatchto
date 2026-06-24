# LineWatchTO Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the initial LineWatchTO monorepo with backend, frontend, local infrastructure, docs, git history, and GitHub remote setup attempt.

**Architecture:** Use a repo-root monorepo with `backend/` for Spring Boot, `frontend/` for Next.js, `docker-compose.yml` for PostgreSQL/PostGIS and Redis, and `docs/` for project specs/plans. Keep v1 focused on a working health baseline and project shape.

**Tech Stack:** Java 21, Spring Boot 3.5.x, Maven, PostgreSQL/PostGIS, Redis, Next.js 16, React 19, TypeScript, Tailwind CSS, Docker Compose, GitHub CLI.

---

### Task 1: Repository Documentation

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Add root README with app positioning, stack, and setup commands.**

- [ ] **Step 2: Add repo ignore rules for Java, Node, env files, and local generated state.**

- [ ] **Step 3: Add `.env.example` with database and Redis defaults.**

### Task 2: Backend Scaffold

**Files:**
- Create: `backend/pom.xml`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/health/HealthControllerTest.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/LinewatchApplication.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/health/HealthController.java`
- Create: `backend/src/main/resources/application.yml`

- [ ] **Step 1: Write the failing health endpoint test.**

- [ ] **Step 2: Run `mvn -f backend/pom.xml test` and confirm it fails because the endpoint/application does not exist yet.**

- [ ] **Step 3: Add minimal Spring Boot app, health controller, and application config.**

- [ ] **Step 4: Run `mvn -f backend/pom.xml test` and confirm the test passes.**

### Task 3: Frontend Scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/eslint.config.mjs`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/globals.css`

- [ ] **Step 1: Add a minimal Next.js App Router project with scripts for dev, build, lint, and typecheck.**

- [ ] **Step 2: Add a simple app shell that presents the LineWatchTO product direction without implementing transit logic.**

- [ ] **Step 3: Run frontend install/check commands when dependencies are available.**

### Task 4: Local Infrastructure

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Add PostgreSQL/PostGIS and Redis services with localhost-bound ports.**

- [ ] **Step 2: Add healthchecks and named volumes.**

### Task 5: Git and Remote Setup

**Files:**
- Modify: repository git metadata.

- [ ] **Step 1: Run `git init`.**

- [ ] **Step 2: Run verification commands.**

- [ ] **Step 3: Commit scaffold with `chore: scaffold linewatch to project`.**

- [ ] **Step 4: Run `gh repo create ttc-reliability-navigator --source=. --private --remote=origin --push`.**

- [ ] **Step 5: If GitHub CLI auth fails, leave the local repo ready and report the exact re-authentication command needed.**
