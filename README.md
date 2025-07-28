🚨 AI Code Review Bot - Your Security Guardian Angel 🤖
Boot.dev Hackathon 2025 Entry
🔗 GitHub: https://github.com/sgharlow/ai-pr-bot
💬 Post: https://www.linkedin.com/feed/update/urn:li:activity:7355469371697217536/

🎯 THE PROBLEM:
That SQL injection in your code? It's already in production.
That hardcoded API key? It's on GitHub.
That N+1 query? Your server is crying.

✨ THE MAGIC:
What if your PR reviews took 30 seconds instead of 4 hours AND actually fixed the bugs for you?

🚀 INTRODUCING: The AI Code Review Bot
PR Created → 🤖 Bot Awakens → 🔍 Scans Code → 💡 Finds Issues
     ↓
🔧 AUTO-GENERATES FIX → 🧪 RUNS CI TESTS → ✅ READY TO MERGE
     ↓
💰 Total Cost: $0.04 (Yes, really!)
🛡️ PRIVACY FIRST: Your secrets NEVER leave your infrastructure. Our Privacy Guard redacts all sensitive data before AI processing.
🎮 GAMIFICATION: Turn code quality into a team sport! Compete on the leaderboard, earn achievements, flex your security score.
📊 FEATURES THAT SLAP:

🔥 5 languages supported (JS/TS, Python, Go, Java, Ruby)
🚨 Instant detection of SQL injection, auth bypasses, hardcoded secrets
🔧 Auto-fix PRs with 95% success rate
💸 Cost tracking - know exactly what you're spending
🏆 Team leaderboards - who writes the cleanest code?
⚡ 30-second reviews - because ain't nobody got time for 4-hour reviews
🔌 Plugin system - add your own rules
💻 CLI tool - npx ai-review before you commit!

🤯 THE NUMBERS:

90% reduction in review time
$0.04 average cost per PR

🎪 SEE IT IN ACTION:
Watch a SQL injection get detected, auto-fixed, and CI-validated in under 30 seconds. Your senior devs will weep tears of joy.

    🤖
    /|\    "I FOUND 3 CRITICAL ISSUES"
   / | \   "...AND I ALREADY FIXED THEM"
     |     "THAT'LL BE 4 CENTS, PLEASE"
    / \
Built with: Node.js, TypeScript, React, OpenAI GPT-4, Tree-sitter, Semgrep, Redis, PostgreSQL
The future of code reviews costs less than a gumball. Ready to revolutionize your workflow?
🌟 Star the repo if you never want to manually review SQL injections again!


# AI PR Bot v0

An AI-powered code review bot that automatically analyzes GitHub pull requests for security vulnerabilities, performance issues, and code quality problems.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- GitHub App credentials
- OpenAI API key

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd ai-pr-bot
   ```

2. **Configure environment**
   ```bash
   cp .env.template .env
   # Edit .env with your credentials
   ```

3. **Start with Docker**
   ```bash
   docker-compose up -d
   ```

4. **Configure GitHub webhook**
   - URL: `https://your-domain.com/webhook/github`
   - Events: Pull requests
   - Secret: Your webhook secret from .env

## 🔧 Configuration

### Required Environment Variables
- `GITHUB_APP_ID` - Your GitHub App ID
- `GITHUB_PRIVATE_KEY` - Your GitHub App private key (PEM format)
- `GITHUB_WEBHOOK_SECRET` - Secret for webhook validation
- `OPENAI_API_KEY` - Your OpenAI API key

### GitHub App Permissions
- **Repository permissions:**
  - Pull requests: Read & Write
  - Contents: Read
  - Issues: Write
  - Metadata: Read

## 🏗️ Architecture

- **Webhook Handler**: Receives GitHub events
- **Job Queue**: Redis-based async processing
- **AI Analysis**: GPT-4 powered code review
- **GitHub Integration**: Posts review comments

## 📊 Features

- ✅ Security vulnerability detection
- ✅ Performance analysis
- ✅ Code quality checks
- ✅ AI-powered contextual reviews
- ✅ Automatic fix suggestions

## 🐳 Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 📝 License

MIT License - see LICENSE file for details
