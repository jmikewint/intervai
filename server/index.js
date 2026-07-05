const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Start a new interview session
app.post("/api/start", async (req, res) => {
  const { role, difficulty } = req.body;

  const prompt = `You are a professional interviewer conducting a behavioural interview for a ${role} position. 
Difficulty level: ${difficulty}.

Your job is to:
1. Ask one strong behavioural interview question to start (use the STAR method context)
2. Keep responses concise and professional
3. Sound like a real interviewer, not a chatbot

Start the interview now with a warm but professional greeting and your first question. Do not mention STAR method explicitly.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    res.json({ message: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start interview" });
  }
});

// Continue the interview conversation
app.post("/api/chat", async (req, res) => {
  const { role, difficulty, history, userMessage, exchangeCount } = req.body;

  const isLastExchange = exchangeCount >= 3;

  const systemPrompt = `You are a professional interviewer conducting a behavioural interview for a ${role} position.
Difficulty: ${difficulty}.

Rules:
- Ask natural follow-up questions that probe deeper into their answer
- Challenge vague answers respectfully
- Keep your responses to 2-4 sentences max
- Sound like a real human interviewer
- Do NOT use bullet points or headers
${isLastExchange ? `- This is the FINAL exchange. Thank them for their time, tell them the interview is wrapping up, and let them know feedback is coming.` : "- Ask one follow-up question to dig deeper into their answer"}`;

  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Understood. I will conduct the interview professionally." }] },
    ...history.map(h => ({
      role: h.role === "interviewer" ? "model" : "user",
      parts: [{ text: h.content }]
    })),
    { role: "user", parts: [{ text: userMessage }] }
  ];

  try {
    const result = await model.generateContent({ contents });
    const text = result.response.text();
    res.json({ message: text, isLastExchange });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get response" });
  }
});

// Generate final feedback
app.post("/api/feedback", async (req, res) => {
  const { role, history } = req.body;

  const transcript = history.map(h => `${h.role === "interviewer" ? "Interviewer" : "Candidate"}: ${h.content}`).join("\n\n");

  const prompt = `You are an expert interview coach. Review this behavioural interview transcript for a ${role} position and provide structured feedback.

TRANSCRIPT:
${transcript}

Provide feedback in this exact JSON format with no markdown or code blocks:
{
  "overallScore": <number 1-10>,
  "summary": "<2-3 sentence overall summary>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "starScore": {
    "situation": <1-10>,
    "task": <1-10>,
    "action": <1-10>,
    "result": <1-10>
  },
  "tipForNextTime": "<one specific actionable tip>"
}`;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text();
    text = text.replace(/```json|```/g, "").trim();
    const feedback = JSON.parse(text);
    res.json({ feedback });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate feedback" });
  }
});

app.listen(3001, () => console.log("IntervAI server running on port 3001"));