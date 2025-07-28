#!/bin/bash

echo "🔧 Setting up database migrations"
echo "================================"

# Check if migrations exist
if [ ! -d "prisma/migrations" ]; then
    echo "📊 Creating initial migration..."
    npx prisma migrate dev --name init
else
    echo "📊 Running existing migrations..."
    npx prisma migrate deploy
fi

echo "✅ Database setup complete!"
