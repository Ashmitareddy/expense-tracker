import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import Expense from './models/Expense.js';

// Load environment variables
dotenv.config();

// Validation for critical cloud database and AI service keys
if (!process.env.MONGO_URI) {
  console.error("CRITICAL ERROR: MONGO_URI is not defined in process.env.");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("CRITICAL ERROR: GEMINI_API_KEY is not defined in process.env.");
  process.exit(1);
}

// Single clean declaration of the Express instance
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Set up multer for memory storage (for file uploads)
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

/**
 * Exponential backoff wrapper for API calls
 */
const withExponentialBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (error.status === 503 || error.status === 429) {
        if (attempt >= maxRetries) {
          throw new Error(`Failed after ${maxRetries} attempts due to server overload.`);
        }
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(`API Overloaded (503/429). Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Throw non-retryable errors immediately
      }
    }
  }
};

// CRUD Routes for Expenses

// READ: Get all expenses
app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ createdAt: -1 });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// CREATE: Add a new manual expense
app.post('/api/expenses', async (req, res) => {
  try {
    const newExpense = new Expense(req.body);
    const savedExpense = await newExpense.save();
    res.status(201).json(savedExpense);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create expense', details: error.message });
  }
});

// UPDATE: Edit an expense
app.put('/api/expenses/:id', async (req, res) => {
  try {
    const updatedExpense = await Expense.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedExpense) return res.status(404).json({ error: 'Expense not found' });
    res.json(updatedExpense);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update expense', details: error.message });
  }
});

// DELETE: Remove an expense
app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const deletedExpense = await Expense.findByIdAndDelete(req.params.id);
    if (!deletedExpense) return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// POST: Upload receipt and parse using Gemini
app.post('/api/expenses/upload', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const mimeType = req.file.mimetype;
    const base64Data = req.file.buffer.toString('base64');

    const result = await withExponentialBackoff(() => 
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              },
              {
                text: "Extract the details from this receipt or invoice. Return ONLY a valid JSON object matching the requested schema."
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchantName: { type: Type.STRING, description: "The name of the merchant or store." },
              amount: { type: Type.NUMBER, description: "The total amount of the expense." },
              category: { 
                type: Type.STRING, 
                enum: ['Food', 'Utility', 'Subscriptions', 'Others'],
                description: "Categorize the expense into one of these four exact categories."
              },
              rawTextSummary: { type: Type.STRING, description: "A concise 1-2 sentence summary of what this bill/receipt was for." }
            },
            required: ["merchantName", "amount", "category", "rawTextSummary"]
          }
        }
      })
    );

    let expenseData;
    try {
      expenseData = JSON.parse(result.text);
    } catch (parseError) {
      console.error("Failed to parse Gemini output as JSON", result.text);
      return res.status(500).json({ error: 'Failed to parse AI response into structured data.' });
    }

    // Save to DB
    const newExpense = new Expense(expenseData);
    const savedExpense = await newExpense.save();
    
    res.status(201).json(savedExpense);
  } catch (error) {
    console.error('Error processing receipt:', error);
    res.status(500).json({ error: 'Internal server error processing the receipt.' });
  }
});

// GET: Financial Insights via Gemini
app.get('/api/expenses/insights', async (req, res) => {
  try {
    const expenses = await Expense.find();
    if (expenses.length === 0) {
      return res.json({ insight: "You haven't logged any expenses yet. Start tracking to get insights!" });
    }

    const summaryData = expenses.map(e => `Amount: $${e.amount}, Category: ${e.category}, Merchant: ${e.merchantName}`).join('; ');

    const result = await withExponentialBackoff(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze these recent expenses and provide ONE concise, professional sentence of financial advice based on the user's spending habits: ${summaryData}`,
      })
    );

    res.json({ insight: result.text.trim() });
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ error: 'Failed to generate financial insights.' });
  }
});

// Unified single PORT setup configuration logic
const PORT = process.env.PORT || 8082;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}`);
  });
}

export default app;
