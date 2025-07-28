# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Build the project
npm run build

# Start production server
npm start

# Database commands
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Deploy database migrations
```

## Architecture Overview

This is an AI-powered GitHub PR review bot built with TypeScript, Fastify, and Prisma. The application follows a modular architecture:

### Core Components

1. **API Server** (`src/index.ts`, `src/app.ts`)
   - Fastify-based REST API
   - Handles GitHub webhooks at `/webhook/github`
   - Health checks at `/health`

2. **GitHub Integration** (`src/lib/github/`)
   - `client.ts`: GitHub App authentication and API client
   - `diff-analyzer.ts`: Analyzes PR diffs for review
   - Uses Octokit for GitHub API interactions

3. **AI Service** (`src/lib/ai-service/`)
   - `enhanced-ai-service.ts`: OpenAI GPT-4 integration for code analysis
   - Performs security, performance, and quality reviews

4. **Queue System** (`src/lib/queue-system/`)
   - Redis-based job queue using Bull
   - Async processing of PR review requests
   - Worker processes in `src/worker.ts`

5. **Database** (PostgreSQL via Prisma)
   - Schema defined in `prisma/schema.prisma`
   - Stores repositories, reviews, and webhook events

### Key Environment Variables

- `GITHUB_APP_ID`: GitHub App ID for authentication
- `GITHUB_PRIVATE_KEY`: PEM-formatted private key
- `GITHUB_WEBHOOK_SECRET`: Webhook validation secret
- `OPENAI_API_KEY`: OpenAI API key for GPT-4
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection for job queue

### Development Flow

1. GitHub sends webhook events to `/webhook/github`
2. Events are validated and queued in Redis
3. Worker processes pick up jobs and analyze PRs
4. AI service reviews code for issues
5. Results are posted back as PR comments

The codebase uses TypeScript with strict typing throughout. Configuration is centralized in `src/config/environment.ts`.