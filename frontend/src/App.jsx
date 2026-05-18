import React from 'react';
import ExpenseDashboard from './components/ExpenseDashboard';

function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white shadow-sm border-b border-slate-200 py-4 px-8">
        <h1 className="text-xl font-semibold text-slate-800 tracking-tight">Enterprise Expense Tracker</h1>
      </nav>
      <main className="p-8 max-w-7xl mx-auto">
        <ExpenseDashboard />
      </main>
    </div>
  );
}

export default App;
