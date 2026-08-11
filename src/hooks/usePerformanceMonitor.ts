import { useEffect } from 'react';
import { db } from '@/lib/db';

export function usePerformanceMonitor() {
  useEffect(() => {
    // Monitor cache stats
    const monitorCache = async () => {
      const stats = await db.getCacheStats();
      console.log('📊 Cache Stats:', stats);
      
      if (stats.estimatedSize > 5000) {
        console.warn('⚠️ Cache size is large. Consider cleanup.');
      }
    };

    // Check every 5 minutes
    const interval = setInterval(monitorCache, 5 * 60 * 1000);
    monitorCache();

    // Cleanup old data daily
    const cleanupInterval = setInterval(async () => {
      await db.cleanupOldData(30);
    }, 24 * 60 * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearInterval(cleanupInterval);
    };
  }, []);

  useEffect(() => {
    // Log performance metrics
    if (window.performance && window.performance.getEntriesByType) {
      const perfData = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      if (perfData) {
        console.log('⚡ Performance Metrics:', {
          dns: `${perfData.domainLookupEnd - perfData.domainLookupStart}ms`,
          tcp: `${perfData.connectEnd - perfData.connectStart}ms`,
          request: `${perfData.responseStart - perfData.requestStart}ms`,
          response: `${perfData.responseEnd - perfData.responseStart}ms`,
          domParsing: `${perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart}ms`,
          totalLoad: `${perfData.loadEventEnd - perfData.fetchStart}ms`
        });
      }
    }
  }, []);
}
