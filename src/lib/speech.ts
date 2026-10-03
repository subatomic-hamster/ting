// Browser speech-to-text via the Web Speech API, with feature detection.

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isSpeechSupported(): boolean {
  return Boolean(ctor());
}

export interface ListenHandlers {
  onText: (text: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError?: (message: string) => void;
}

/** Starts listening; returns a function that stops. */
export function listen({ onText, onEnd, onError }: ListenHandlers): () => void {
  const C = ctor();
  if (!C) {
    onError?.('Speech input is not supported in this browser.');
    onEnd();
    return () => {};
  }
  const rec = new C();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      final = e.results[i].isFinal;
    }
    onText(text, final);
  };
  rec.onerror = (e) => onError?.(e.error === 'not-allowed' ? 'Microphone permission was denied.' : e.error);
  rec.onend = onEnd;
  rec.start();
  return () => rec.stop();
}
