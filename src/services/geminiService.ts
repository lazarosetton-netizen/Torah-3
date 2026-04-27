import { GoogleGenAI, Part } from "@google/genai";
import { AnalysisResult, ChatMessage, FileData, Language } from "../types";

const API_KEY = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey: API_KEY });

const SYSTEM_INSTRUCTION = `You are a highly learned Orthodox Rabbi and scholar of Torah and Gemara. 
Your knowledge is deeply rooted in traditional Jewish sources and portals such as:
- https://daf-yomi.com/
- https://hebrewbooks.org/
- https://www.shas.org/
- https://www.chabad.org/
- https://www.sefaria.org.il

Your mission is to help students study Jewish texts with depth, accuracy, and reverence.

If the submitted text is from the Talmud Bavli (Gemara):
1. Explain the entire image in as much detail as possible.
2. Explain the complete content contained in the sides and center of the page.
3. Translate and explain the explanations of Rashi (inner margin) and Tosafot (outer margin).
4. Detail and explain the entire content of EACH LINE contained in the image.
5. Detail the Masechet, Daf, and Amud.

If the content is any other type of Jewish book:
1. Provide a detailed translation and explanation from an Orthodox Jewish perspective.
2. Contextualize the teachings within Jewish tradition.

Always answer with the wisdom, patience, and warmth of an Orthodox Rabbi.
ALWAYS end your initial translation and explanation by asking if the user has further questions.
Respond ONLY in the language requested by the user.
Supported Languages: Portuguese, English, Spanish, French, Russian.`;

export async function analyzeText(file: FileData, language: Language): Promise<AnalysisResult> {
  const model = "gemini-2.0-flash";

  const prompt = `${SYSTEM_INSTRUCTION}

Please provide a complete analysis of this Jewish text in ${language}.

IF THIS IS GEMARA: 
- Translate and explain EVERY SINGLE LINE in the center text.
- Detail and explain the Rashi and Tosafot commentaries on the sides.
- Explain the context of the Masechet and the specific Daf.

IF THIS IS ANOTHER JEWISH BOOK:
- Provide a thorough translation and explanation based on the ethics, laws, or parables contained within.

Conclude by asking if the student has any further questions about these holy words.`;

  const imagePart: Part = {
    inlineData: {
      mimeType: file.mimeType,
      data: file.base64,
    },
  };

  const textPart: Part = {
    text: prompt,
  };

  const response = await ai.models.generateContent({
    model,
    contents: [imagePart, textPart],
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
  const model = "gemini-2.0-flash";

  let fullMessage = `${SYSTEM_INSTRUCTION}\n\nRespond in ${language}.\n\nUser asks: ${userMessage}`;

  if (contextText) {
    fullMessage += `\n\nContext of current study: ${contextText}`;
  }

  const parts: Part[] = [{ text: fullMessage }];

  if (contextFile) {
    parts.push({
      inlineData: {
        mimeType: contextFile.mimeType,
        data: contextFile.base64,
      },
    });
  }

  const historyParts: Part[] = history.map(msg => ({
    text: `${msg.role === 'user' ? 'User' : 'Rabbi'}: ${msg.content}`,
  }));

  const allParts: Part[] = [...historyParts, ...parts];

  const response = await ai.models.generateContent({
    model,
    contents: allParts,
  });

  return response.text || "Please forgive me, I could not formulate a response.";
}
