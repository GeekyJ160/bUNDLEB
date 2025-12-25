import { GoogleGenAI, Type } from "@google/genai";
import { LintIssue, ComponentMetadata } from "../types";

const getAiClient = () => {
  const apiKey = typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const analyzeBundleWithGemini = async (code: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) throw new Error("API_KEY not configured.");
  const model = 'gemini-3-pro-preview';
  const truncatedCode = code.length > 100000 ? code.substring(0, 100000) + "\n...[truncated]" : code;
  const response = await ai.models.generateContent({
    model,
    config: {
      systemInstruction: "You are an expert senior software engineer specializing in code quality and architecture. Analyze the provided code for performance bottlenecks, security risks, and architectural improvements.",
    },
    contents: `Analyze this code: \n\n ${truncatedCode}`,
  });
  return response.text || "";
};

export const discoverComponentsWithGemini = async (code: string): Promise<ComponentMetadata[]> => {
  const ai = getAiClient();
  if (!ai) throw new Error("API_KEY not configured.");
  
  const model = 'gemini-3-pro-preview';
  const truncatedCode = code.length > 60000 ? code.substring(0, 60000) : code;

  const response = await ai.models.generateContent({
    model,
    config: {
      systemInstruction: "You are a UI component extractor. Your goal is to find React or standard JS components in the provided code and identify their prop signatures.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            props: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING, description: "One of: 'string', 'number', 'boolean', 'enum'" },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  defaultValue: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["name", "type"]
              }
            }
          },
          required: ["name", "props"]
        }
      }
    },
    contents: `Identify interactive components and their props in the following code:\n\n${truncatedCode}`
  });

  const jsonStr = response.text;
  if (!jsonStr) return [];
  return JSON.parse(jsonStr) as ComponentMetadata[];
};

export const lintBundleWithGemini = async (code: string): Promise<LintIssue[]> => {
  const ai = getAiClient();
  if (!ai) throw new Error("API_KEY not configured.");
  const model = 'gemini-3-pro-preview';
  const truncatedCode = code.length > 50000 ? code.substring(0, 50000) : code;
  
  const response = await ai.models.generateContent({
    model,
    config: {
      systemInstruction: "You are an expert code linter. Analyze the provided code for bugs, anti-patterns, and style violations. Provide specific line numbers if possible.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            line: { type: Type.INTEGER },
            severity: { type: Type.STRING, description: "One of: 'error', 'warning', 'info'" },
            message: { type: Type.STRING },
            suggestion: { type: Type.STRING }
          },
          required: ["severity", "message"]
        }
      }
    },
    contents: `Lint the following code and return a list of issues:\n\n${truncatedCode}`
  });
  
  const jsonStr = response.text;
  if (!jsonStr) return [];
  return JSON.parse(jsonStr) as LintIssue[];
};

export const refactorBundleWithGemini = async (code: string, instruction: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) throw new Error("API_KEY not configured.");
  const model = 'gemini-3-pro-preview';
  const response = await ai.models.generateContent({
    model,
    contents: `Refactor the following code based on this instruction: ${instruction}\n\nCode:\n${code}`
  });
  let res = response.text || "";
  if (res.startsWith("```")) res = res.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
  return res.trim();
};