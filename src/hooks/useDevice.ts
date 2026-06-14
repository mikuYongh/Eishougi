import { useState, useEffect } from 'react';

export function useDevice() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      // Check user agent for mobile devices
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobileDevice = /android|ipad|iphone|ipod/i.test(userAgent.toLowerCase());
      
      // Also fallback to screen width just in case
      const isSmallScreen = window.innerWidth < 768;

      setIsMobile(isMobileDevice || isSmallScreen);
    };

    // Initial check
    checkDevice();

    // Listen to resize events
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  return { isMobile };
}
