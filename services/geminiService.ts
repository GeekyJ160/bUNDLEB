import { GoogleGenAI, Type } from "@google/genai";
import { LintIssue } from "../types";

const getAiClient = () => {
  // Safety check for process.env in browser environments
  const apiKey = typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;
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
        systemInstruction: "You are an expert senior software engineer specializing in web security, code quality, anti-patterns, performance optimization, and software architecture. Your goal is to provide a strict, actionable code audit focusing on modularity, maintainability, and security.",
      },
      contents: `Analyze the provided JavaScript/TypeScript bundled code.
      
      Output a report in Markdown format focusing on these specific areas:

      ### 1. 🛡️ Security Risks
      Identify critical vulnerabilities: XSS, injection attacks, hardcoded secrets/API keys, unsafe 'eval' or 'innerHTML' usage, and insecure DOM manipulation. If none, state "No critical risks found."

      ### 2. 🚫 Bad Practices & Anti-Patterns
      Highlight code smells, deprecated APIs, poor variable naming, lack of error handling, global namespace pollution, or spaghetti code. Suggest modern alternatives. Ignore standard transpilation artifacts (e.g., Babel helpers).

      ### 3. ⚡ Performance Optimizations
      Suggest specific improvements for runtime speed, memory usage, rendering cycles, or bundle size reduction (e.g., tree-shaking opportunities, expensive loops, layout thrashing).

      ### 4. 🧱 Code Structure & Modularity
      Evaluate the codebase's architectural quality. Identify issues with separation of concerns, tight coupling between modules, monolithic functions, or poor file organization. Suggest specific refactoring strategies to improve modularity and reusability.

      ### 5. 📝 Executive Summary
      A concise summary of the bundle's overall quality score (0-100) and the most urgent fix required.

      Code to analyze:
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

export const refactorBundleWithGemini = async (code: string, instruction: string = "Optimize and clean up this code."): Promise<string> => {
  const ai = getAiClient();
  if (!ai) {
    throw new Error("API_KEY not configured in environment.");
  }

  try {
    const model = 'gemini-3-pro-preview';
    const truncatedCode = code.length > 80000 ? code.substring(0, 80000) : code;

    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: "You are an automated code refactoring engine. Your ONLY job is to output the transformed code based on the user's instructions. Do not explain your changes. Do not use Markdown fencing unless absolutely necessary, but preferably output just the raw code. If you must use Markdown, use ```javascript blocks.",
      },
      contents: `Refactor the following code.
      
      Instruction: ${instruction}

      Original Code:
      ${truncatedCode}
      `
    });

    let refactoredCode = response.text || "";
    
    // Strip markdown fencing if present
    if (refactoredCode.startsWith("```")) {
      refactoredCode = refactoredCode.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
    }

    return refactoredCode.trim();
  } catch (error) {
    console.error("Gemini Refactoring Error:", error);
    throw new Error("Failed to refactor bundle with AI.");
  }
};