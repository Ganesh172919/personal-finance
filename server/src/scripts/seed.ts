import mongoose from "mongoose";
import dotenv from "dotenv";
import FinancialProfileModel from "../models/financialProfileModel";
import AgentOutputModel from "../models/agentOutputModel";
import TransactionModel from "../models/transactionModel";

dotenv.config();

async function seedProfile() {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("✅ Connected to MongoDB");

    // Your existing user ID from MongoDB
    const userId = new mongoose.Types.ObjectId("673085213cfb988797178279");

    // Check and delete existing profile if needed
    await FinancialProfileModel.deleteOne({ userId });
    await AgentOutputModel.deleteMany({ userId });
    await TransactionModel.deleteMany({ userId });

    // Create financial profile for your existing user
    const profile = await FinancialProfileModel.create({
      userId: userId,
      age: 30,
      annual_income: 75000,
      monthly_expenses: 3500,
      savings: 15000,
      goals: [
        { name: "Emergency Fund", target: 300000, current: 240000, deadline: "2024-12-31", priority: 1 },
        { name: "House Down Payment", target: 1500000, current: 850000, deadline: "2026-06-30", priority: 2 },
        { name: "Europe Vacation", target: 200000, current: 45000, deadline: "2025-12-31", priority: 3 }
      ],
      debts: [
        { name: "Student Loan", balance: 25000, interest_rate: 4.5, minimum_payment: 300, type: "student" },
        { name: "Credit Card", balance: 5000, interest_rate: 18.9, minimum_payment: 150, type: "credit_card" }
      ],
      risk_tolerance: "moderate",
      investment_experience: "beginner"
    });

    console.log("✅ Financial profile created for user");

    const now = new Date();
    await TransactionModel.insertMany([
      { userId, amount: 5000, category: "Salary", description: "Monthly salary", date: now, type: "income" },
      { userId, amount: -1500, category: "Rent", description: "Monthly rent", date: now, type: "expense" },
      { userId, amount: -400, category: "Groceries", description: "Grocery shopping", date: now, type: "expense" },
      { userId, amount: -200, category: "Utilities", description: "Electric bill", date: now, type: "expense" },
      { userId, amount: -300, category: "Entertainment", description: "Dining out", date: now, type: "expense" },
      { userId, amount: -100, category: "Transportation", description: "Gas", date: now, type: "expense" }
    ]);

    await FinancialProfileModel.updateOne(
      { _id: profile._id },
      { $set: { transactionsCount: 6, transactionsUpdatedAt: now } }
    );

    // Create sample agent outputs for display
    const sampleOutputs = [
      {
        userId: userId,
        sessionId: "session-1",
        userInput: "How can I save more money?",
        agentType: "master",
        outputData: {
          title: "Savings Optimization Strategy",
          description: "Based on your spending patterns, you can save an additional ₹5,000 per month by optimizing your expenses.",
          action: "review_budget"
        },
        analysis_type: "budget_planning",
        agents_involved: ["budget_planner", "income_analyzer"],
        priority: "high",
        actionable: true
      },
      {
        userId: userId,
        sessionId: "session-2",
        userInput: "What should be my investment strategy?",
        agentType: "master",
        outputData: {
          title: "Personalized Investment Plan",
          description: "With moderate risk tolerance, a 60-40 equity-debt portfolio is recommended for optimal growth.",
          action: "invest"
        },
        analysis_type: "investment_advice",
        agents_involved: ["investment_advisor"],
        priority: "medium",
        actionable: true
      },
      {
        userId: userId,
        sessionId: "session-3",
        userInput: "Explain compound interest",
        agentType: "educator",
        outputData: {
          title: "Understanding Compound Interest",
          description: "Compound interest is when you earn interest on both your original investment and previously earned interest.",
          action: "start_learning"
        },
        analysis_type: "financial_education",
        agents_involved: ["financial_educator"],
        priority: "low",
        actionable: false
      }
    ];

    await AgentOutputModel.insertMany(sampleOutputs);
    console.log("✅ Sample agent outputs created");

    console.log("\n📋 Summary:");
    console.log("User Email: manyamjagadeeswar7989@gmail.com");
    console.log("User ID: 673085213cfb988797178279");
    console.log("Profile Created: Yes");
    console.log("Sample Insights: 3 created");
    
    process.exit(0);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seedProfile();
