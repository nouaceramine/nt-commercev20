import { useEffect, useCallback, useRef } from 'react';
import { playSuccessBeep, playErrorBeep } from '../utils/beep';

/**
 * Custom hook for handling barcode scanner input
 * 
 * @param {Function} onScan - Callback function when barcode is scanned (receives barcode string)
 * @param {Object} options - Options
 * @param {boolean} options.playSound - Whether to play beep sound on scan (default: true)
 * @param {number} options.minLength - Minimum barcode length to trigger scan (default: 3)
 * @param {number} options.maxTime - Maximum time between keystrokes in ms (default: 100)
 * @param {boolean} options.enabled - Whether the scanner is enabled (default: true)
 */
export function useBarcodeScanner(onScan, options = {}) {
  const {
    playSound = true,
    minLength = 3,
    maxTime = 100,
    enabled = true
  } = options;

  const buffer = useRef('');
  const lastKeyTime = useRef(Date.now());
  const inputRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    if (!enabled) return;

    const currentTime = Date.now();
    
    // If too much time has passed, reset buffer
    if (currentTime - lastKeyTime.current > maxTime) {
      buffer.current = '';
    }
    lastKeyTime.current = currentTime;

    // Handle Enter key - this triggers the scan
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (buffer.current.length >= minLength) {
        const barcode = buffer.current;
        buffer.current = '';
        
        // Call the onScan callback
        if (onScan) {
          const result = onScan(barcode);
          
          // Play sound based on result (if result is explicitly false, play error)
          if (playSound) {
            if (result === false) {
              playErrorBeep();
            } else {
              playSuccessBeep();
            }
          }
        }
      }
      return;
    }

    // Only add printable characters to buffer
    if (e.key.length === 1) {
      buffer.current += e.key;
    }
  }, [enabled, maxTime, minLength, onScan, playSound]);

  // Attach to specific input or document
  const attachToInput = useCallback((inputElement) => {
    inputRef.current = inputElement;
    if (inputElement) {
      inputElement.addEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown]); // eslint-disable-line react-hooks/exhaustive-deps

  const detachFromInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.removeEventListener('keydown', handleKeyDown);
      inputRef.current = null;
    }
  }, [handleKeyDown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup
  useEffect(() => {
    return () => {
      detachFromInput();
    };
  }, [detachFromInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // Return the ref callback for easy attachment
  const refCallback = useCallback((node) => {
    detachFromInput();
    if (node) {
      attachToInput(node);
    }
  }, [attachToInput, detachFromInput]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    refCallback,
    attachToInput,
    detachFromInput,
    handleKeyDown
  };
}

/**
 * Simple hook for handling Enter key press on search inputs
 * This is for inputs that already have onChange handling
 * 
 * @param {Function} onEnter - Callback when Enter is pressed
 */
export function useEnterKeySearch(onEnter) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onEnter) {
        onEnter(e.target.value);
      }
    }
  }, [onEnter]); // eslint-disable-line react-hooks/exhaustive-deps

  return { handleKeyDown };
}

export default useBarcodeScanner;
