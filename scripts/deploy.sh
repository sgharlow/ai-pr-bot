#!/bin/bash

echo "🚀 Deploying AI PR Bot v0"
echo "========================"

# Check for .env file
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Please copy .env.template to .env and configure it"
    exit 1
fi

# Run database migrations
echo "📊 Running database migrations..."
docker-compose run --rm backend npm run db:migrate

# Start services
echo "🐳 Starting services..."
docker-compose up -d

# Wait for services
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo "🔍 Checking service health..."
curl -s http://localhost:3001/health | jq .

echo "✅ Deployment complete!"
echo "   API: http://localhost:3001"
echo "   Health: http://localhost:3001/health"
