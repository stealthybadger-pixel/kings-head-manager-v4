import { useState, useEffect, useCallback, useRef } from 'react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export const useVoiceCommand = (onCommand: (text: string) => void) => {
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(isListening);
  const onCommandRef = useRef(onCommand);
  
  // Keep ref in sync to handle auto-restart in callbacks
  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Browser not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-GB'; // Optimised for UK English

    recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const text = event.results[last][0].transcript.trim();
      setLastTranscript(text);
      
      const lower = text.toLowerCase();
      // Wake word: "Heston"
      if (lower.startsWith('heston')) {
        const cmd = lower.replace(/^heston/, '').trim();
        if (cmd) onCommandRef.current(cmd);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setIsListening(false);
        setError('Mic Access Denied');
      } else if (event.error === 'no-speech') {
        // Ignore silence errors
      } else {
        console.warn("Voice Error:", event.error);
      }
    };

    recognition.onend = () => {
      // Auto-restart if supposed to be listening (Always-On)
      if (isListeningRef.current) {
        try {
            recognition.start();
        } catch (e) {
            // Ignore start errors during restart
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;
    
    if (isListening) {
      setIsListening(false);
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        setError(null);
      } catch (e) {
        console.error("Start failed", e);
      }
    }
  }, [isListening]);

  return { isListening, lastTranscript, error, toggleListening };
};