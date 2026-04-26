import { GoogleGenAI } from "@google/genai";
import { AnalysisResult, ChatMessage, FileData, Language } from "../types";

const ai = new GoogleGenAI({ apiKey: "SUA_CHAVE_AQUI" });

const SYSTEM_INSTRUCTION = `You are a highly learned Orthodox Rabbi and scholar of Torah and Gemara. 
Your knowledge is deeply rooted in traditional Jewish sources and portals such as:
- https://daf-yomi.com/
- https://hebrewbooks.org/
- https://www.shas.org/
- https://www.chabad.org/
- https://www.sefaria.org.il

Your mission is to help students study Jewish texts with depth, accuracy, and reverence.

### Instructions for Analysis:
If the submitted text is from the Talmud Bavli (Gemara):
1. **Explain the entire image in as much detail as possible.**
2. **Explain the complete content contained in the sides and center of the page.**
3. **Translate and explain the explanations of Rashi (inner margin) and Tosafot (outer margin).**
4. **Detail and explain the entire content of EACH LINE contained in the image.**
5. **Detail the Masechet, Daf, and Amud.**

If the content is any other type of Jewish book (Halacha, Musar, Midrash, Parables, Customs, Traditions, Ethics, etc.):
1. **Provide a detailed translation and explanation of the subject from an Orthodox Jewish perspective.**
2. **Contextualize the teachings within Jewish tradition.**

### Interaction Style:
- Always answer with the wisdom, patience, and warmth of an Orthodox Rabbi.
- Use traditional terminology where appropriate.
- ALWAYS end your initial translation and explanation by asking if the user has further questions.
- Create a clear interaction dialog at the end.
- Respond ONLY in the language requested by the user.

### Supported Languages:
- Portuguese, English, Spanish, French, Russian.`;

export async function analyzeText(file: FileData, language: Language): Promise<AnalysisResult> {
  const model = "gemini-2.5-flash-preview-05-20";

  const prompt = `Please provide a complete analysis of this Jewish text in ${language}.
  
  IF THIS IS GEMARA: 
  - Translate and explain EVERY SINGLE LINE in the center text.
  - Detail and explain the Rashi and Tosafot commentaries on the sides.
  - Explain the context of the Masechet and the specific Daf.
  
  IF THIS IS ANOTHER JEWISH BOOK:
  - Provide a thorough translation and explanation based on the ethics, laws, or parables contained within.
  
  Conclude by asking if the student has any further questions about these holy words.`;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: file.mimeType,
              data: file.base64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    },
  });

  const text = response.text || "I am sorry, but I could not analyze this document.";
  const isGemara = text.toLowerCase().includes("gemara") || text.toLowerCase().includes("talmud");

  return {
    text,
    isGemara,
    language,
  };
}

export async function chatWithRabbi(
  history: ChatMessage[],
  userMessage: string,
  language: Language,
  contextText?: string,
  contextFile?: FileData
): Promise<string> {
  const model = "gemini-2.5-flash-preview-05-20";

  const contents = history.map(msg => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));

  const currentParts: any[] = [{ text: `User asks in ${language}: ${userMessage}` }];

  if (contextText) {
    currentParts.push({ text: `Context of current study: ${contextText}` });
  }

  if (contextFile) {
    currentParts.push({
      inlineData: {
        mimeType: contextFile.mimeType,
        data: contextFile.base64,
      },
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [
      ...contents,
      { role: "user", parts: currentParts },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    },
  });

  return response.text || "Please forgive me, I could not formulate a response.";
}
