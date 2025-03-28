import dotenv from "dotenv";
dotenv.config();

const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpire: process.env.JWT_EXPIRE || "30d",
  jwtCookieExpire: parseInt(process.env.JWT_COOKIE_EXPIRE || "30", 10),
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  defaultCostPerKm: parseFloat(process.env.DEFAULT_COST_PER_KM || "0.70"),
  baseUrl: process.env.BASE_URL || "http://localhost:5000",
  apiInternalToken: process.env.API_INTERNAL_TOKEN,

  // Gemini AI configuration
  geminiApiKey: process.env.GEMINI_API_KEY,
};

export default config;
