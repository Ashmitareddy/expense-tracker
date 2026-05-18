import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema({
  merchantName: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, enum: ['Food', 'Utility', 'Subscriptions', 'Others'], required: true },
  rawTextSummary: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Expense', expenseSchema);
