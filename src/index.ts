import { createApp } from './app-simple';
import { config } from './config/environment';

async function start() {
  try {
    console.log('[INFO] Starting AI Code Review Bot API (Simple Mode)...');
    
    // Create app
    const app = await createApp({
      logger: {
        level: config.LOG_LEVEL
      }
    });
    
    // Start server
    await app.listen({
      port: config.PORT,
      host: config.HOST
    });

    console.log(`[INFO] Server listening on ${config.HOST}:${config.PORT}`);
    console.log(`[INFO] Health check available at http://${config.HOST}:${config.PORT}/health`);
    
  } catch (error) {
    console.error('[ERROR] Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  console.error('[ERROR] Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[ERROR] Uncaught exception:', err);
  process.exit(1);
});

// Start the server
start();