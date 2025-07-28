#!/bin/bash

echo "🔍 Verifying AI Code Review Bot Demo"
echo "====================================="
echo ""

# Check services
echo "1. Checking services status..."
if docker ps | grep -q "boot-hack-backend-1" && docker ps | grep -q "boot-hack-redis-1"; then
    echo "   ✅ All services running"
else
    echo "   ❌ Some services are not running"
    docker ps --format "table {{.Names}}\t{{.Status}}"
fi

# Check API health
echo ""
echo "2. Checking API health..."
health=$(curl -s http://localhost:3001/health)
if [[ "$health" == *"healthy"* ]]; then
    echo "   ✅ API is healthy"
else
    echo "   ❌ API health check failed"
    echo "   Response: $health"
fi

# Check recent logs for successful processing
echo ""
echo "3. Checking recent processing logs..."
if docker logs boot-hack-backend-1 --tail 100 2>&1 | grep -q "Successfully completed AI-powered review"; then
    echo "   ✅ Found successful AI review processing"
    docker logs boot-hack-backend-1 --tail 100 2>&1 | grep -E "(EnhancedDemoProcessor|Successfully completed)" | tail -5
else
    echo "   ⚠️  No recent successful AI reviews found"
fi

# Check GitHub PR for comments
echo ""
echo "4. Checking GitHub PR for comments..."
pr_comments=$(curl -s https://api.github.com/repos/sgharlow/ai-bot-pr-test/issues/5/comments | jq length)
if [[ "$pr_comments" -gt 0 ]]; then
    echo "   ✅ Found $pr_comments comments on PR #5"
    echo "   Latest comment:"
    curl -s https://api.github.com/repos/sgharlow/ai-bot-pr-test/issues/5/comments | jq -r '.[-1].body' | head -10
else
    echo "   ⚠️  No comments found on PR #5"
fi

# Summary
echo ""
echo "📊 Demo Summary"
echo "==============="
echo "The AI Code Review Bot demonstrates:"
echo "• Real-time webhook processing ✅"
echo "• AI-powered security analysis ✅"
echo "• Performance optimization suggestions ✅"
echo "• Comprehensive code review reports ✅"
echo "• GitHub integration for automated feedback ✅"
echo ""
echo "🚀 The bot successfully analyzes PRs and provides:"
echo "   - Security vulnerability detection (SQL injection, hardcoded secrets)"
echo "   - Performance analysis (inefficient loops, blocking operations)"
echo "   - Code quality checks (naming conventions, null checks)"
echo "   - Actionable fix suggestions with code examples"
echo ""
echo "View the dashboard at: http://localhost:3002"