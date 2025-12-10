import { GoogleGenAI, Type } from "@google/genai";
import { LintIssue } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const analyzeBundleWithGemini = async (code: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) {
    throw new Error("API_KEY not configured in environment.");
  }

  try {
    // Use gemini-3-pro-preview for complex coding and reasoning tasks
    const model = 'gemini-3-pro-preview';
    
    // Truncate code if it's extremely massive, but leverage the large context window.
    const truncatedCode = code.length > 100000 ? code.substring(0, 100000) + "\n...[truncated]" : code;

    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: "You are an expert senior software engineer specializing in web security and performance optimization.",
      },
      contents: `Analyze the provided JavaScript/TypeScript bundled code.
      
      Report Structure:
      1. **Bundle Purpose**: Briefly explain what this code likely does.
      2. **Security Assessment**: Identify potential vulnerabilities (XSS, secrets, eval, unsafe DOM manipulation).
      3. **Performance Optimization**: Suggest specific improvements (loops, memory usage, rendering).
      4. **Code Quality**: Point out anti-patterns or modern syntax improvements.

      If the code appears safe and optimized, state that clearly.

      Code:
      \`\`\`javascript
      ${truncatedCode}
      \`\`\`
      `,
    });

    return response.text || "No analysis could be generated.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("Failed to analyze bundle with AI.");
  }
};

export const lintBundleWithGemini = async (code: string): Promise<LintIssue[]> => {
  const ai = getAiClient();
  if (!ai) {
    throw new Error("API_KEY not configured in environment.");
  }

  try {
    const model = 'gemini-3-pro-preview';
    // Use a slightly smaller context for linting to focus on precision, though 3-pro handles large context well.
    const truncatedCode = code.length > 50000 ? code.substring(0, 50000) : code;

    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: "You are a strict code linter assistant. Identify syntax errors, logical bugs, potential runtime errors, code style violations, and bad practices in JavaScript/TypeScript code.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              line: { 
                type: Type.INTEGER,
                description: "The approximate line number in the bundled code where the issue is found."
              },
              severity: { 
                type: Type.STRING,
                description: "The severity of the issue: 'error', 'warning', or 'info'."
              },
              message: { 
                type: Type.STRING,
                description: "A concise description of the issue."
              },
              suggestion: { 
                type: Type.STRING,
                description: "A suggested fix or recommendation."
              }
            },
            required: ["severity", "message"]
          }
        }
      },
      contents: `Lint the following bundled JavaScript code. Return a JSON list of issues.
      
      Code:
      ${truncatedCode}
      `
    });

    const jsonStr = response.text;
    if (!jsonStr) return [];
    
    return JSON.parse(jsonStr) as LintIssue[];
  } catch (error) {
    console.error("Gemini Linting Error:", error);
    throw new Error("Failed to lint bundle with AI.");
  }
};
