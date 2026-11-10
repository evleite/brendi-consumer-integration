import { setEnvForTest, resetEnvCache } from '@/config/env.js';
import { resetConstantsCache } from '@/config/constants.js';
import { resetLogger } from '@/shared/logger/logger.js';

// Reset all caches before each test file
beforeEach(() => {
  resetEnvCache();
  resetConstantsCache();
  resetLogger();
  
  // Set default test environment
  setEnvForTest({ 
    POLLING_ENABLED: false,
    LOG_LEVEL: 'silent',
    CONSUMER_API_KEYS: 'test-key-1,test-key-2',
  });
});