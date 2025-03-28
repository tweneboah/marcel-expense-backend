import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

async function testGemini() {
  try {
    console.log(
      "Testing Gemini API with key:",
      process.env.GEMINI_API_KEY?.substring(0, 5) + "..."
    );
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Try different model names
    console.log("Trying with gemini-1.5-pro model...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const result = await model.generateContent(
      "Write a brief professional expense note about a business trip from Tarkwa to Accra"
    );
    console.log("\nAPI Response:");
    console.log(result.response.text());
    console.log("\nGemini API is working correctly! ✅");
  } catch (error) {
    console.error("\nAPI Error:", error.message);

    try {
      // Fallback to another model version if the first one fails
      console.log("\nFalling back to gemini-pro model...");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });

      const result = await model.generateContent(
        "Write a brief professional expense note about a business trip from Tarkwa to Accra"
      );
      console.log("\nAPI Response with fallback model:");
      console.log(result.response.text());
      console.log("\nGemini API is working with fallback model! ✅");
    } catch (fallbackError) {
      console.error("\nFallback API Error:", fallbackError.message);
      console.log("\nGemini API test failed! ❌");

      console.log("\nPossible issues:");
      console.log("1. Invalid API key");
      console.log("2. API key doesn't have access to Gemini models");
      console.log("3. Network connectivity issue");
      console.log("4. Different model name or API version required");
    }
  }
}

testGemini();
