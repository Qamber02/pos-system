import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  // Get the initial state from navigator.onLine
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Handler to update state to true
    const handleOnline = () => {
      console.log('App is online');
      setIsOnline(true);
    };
    
    // Handler to update state to false
    const handleOffline = () => {
      console.log('App is offline');
      setIsOnline(false);
    };

    // Add the event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup function to remove listeners
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); // Empty array means this runs only once on mount

  return isOnline;
}