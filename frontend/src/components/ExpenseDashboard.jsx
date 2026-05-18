import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { UploadCloud, Trash2, Loader2, Info } from 'lucide-react';

const API_BASE = '/api/expenses';
const CATEGORY_COLORS = {
  'Food': '#f59e0b',
  'Utility': '#14b8a6',
  'Subscriptions': '#4f46e5',
  'Others': '#64748b'
};

const ExpenseDashboard = () => {
  const [expenses, setExpenses] = useState([]);
  const [insight, setInsight] = useState('');
  const [loading, setLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchExpenses();
  }, []);

  useEffect(() => {
    if (expenses.length > 0) {
      fetchInsights();
    }
  }, [expenses]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(API_BASE);
      // Defensively guard frontend state
      setExpenses(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch expenses', error);
      setExpenses([]);
    }
    setLoading(false);
  };

  const fetchInsights = async () => {
    setInsightLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/insights`);
      setInsight(data.insight);
    } catch (error) {
      console.error('Failed to fetch insights', error);
    }
    setInsightLoading(false);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('receipt', file);

    setUploading(true);
    try {
      await axios.post(`${API_BASE}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchExpenses(); // Refresh table
    } catch (error) {
      console.error('Error uploading receipt', error);
      alert('Failed to process the receipt. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await axios.delete(`${API_BASE}/${id}`);
      setExpenses(prevExpenses => Array.isArray(prevExpenses) ? prevExpenses.filter(e => e._id !== id) : []);
    } catch (error) {
      console.error('Failed to delete expense', error);
    }
  };

  const calculateTotal = () => {
    return expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2);
  };

  const getChartData = () => {
    const grouped = expenses.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
      return acc;
    }, {});
    return Object.keys(grouped).map(key => ({
      name: key,
      value: grouped[key]
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left Column */}
      <div className="lg:col-span-2 space-y-6">

        {/* Upload Zone */}
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 flex flex-col items-center justify-center bg-white transition hover:bg-slate-50 relative overflow-hidden">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept="image/*,application/pdf"
            disabled={uploading}
          />
          {uploading ? (
            <div className="flex flex-col items-center text-slate-500">
              <Loader2 className="h-10 w-10 animate-spin mb-3 text-indigo-600" />
              <p className="font-medium text-slate-800">Processing receipt with AI...</p>
              <p className="text-sm mt-1 text-slate-500">Extracting details and categorizing</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-slate-500">
              <UploadCloud className="h-12 w-12 mb-3 text-slate-400" />
              <p className="font-medium text-slate-700 text-lg">Drag & drop your receipt here</p>
              <p className="text-sm mt-1">Supports PDF, JPG, PNG up to 10MB</p>
            </div>
          )}
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Expense Log</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Merchant</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-10 text-center text-slate-500">
                      Loading expenses...
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-10 text-center text-slate-500">
                      No expenses logged yet. Upload a receipt to start.
                    </td>
                  </tr>
                ) : (
                  expenses.map((expense) => (
                    <tr key={expense._id} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-4 text-slate-600">
                        {new Date(expense.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {expense.merchantName}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-900">
                        ${expense.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(expense._id)}
                          className="text-slate-400 hover:text-red-600 transition p-1"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="space-y-6">

        {/* Total Metric Card */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Total Expenditure</h3>
          <p className="text-4xl font-bold text-slate-900">${calculateTotal()}</p>
        </div>

        {/* Insight Banner */}
        <div className="bg-slate-800 rounded-lg p-5 flex items-start gap-4 shadow-sm">
          <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-white mb-1">AI Financial Insight</h4>
            <p className="text-sm text-slate-300 leading-relaxed">
              {insightLoading ? 'Analyzing spending habits...' : (insight || 'Upload expenses to get automated insights.')}
            </p>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-6">Spending by Category</h3>
          {expenses.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={getChartData()}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {getChartData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || CATEGORY_COLORS['Others']} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `$${value.toFixed(2)}`}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">
              Insufficient data for visualization
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpenseDashboard;
