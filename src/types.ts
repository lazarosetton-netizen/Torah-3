export type Language = 'en' | 'pt' | 'es' | 'fr' | 'ru';

export interface AnalysisResult {
  text: string;
  isGemara: boolean;
  language: Language;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FileData {
  base64: string;
  mimeType: string;
  name: string;
}

export interface SavedStudy {
  id?: string;
  userId: string;
  fileName: string;
  mimeType: string;
  fileBase64?: string;
  analysisText: string;
  isGemara: boolean;
  language: Language;
  createdAt: any; // Timestamp
  chatHistory: ChatMessage[];
}
