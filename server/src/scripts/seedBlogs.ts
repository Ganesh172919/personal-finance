import mongoose from 'mongoose';
import { BlogPost } from '../models/blogPostModel';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';

const MONGODB_URI = getEnv().MONGO_URI;

const mockAuthors = [
  {
    name: 'Kunal Shah',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kunal',
    bio: 'Fintech Founder & Angel Investor',
  },
  {
    name: 'Ankur Warikoo',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ankur',
    bio: 'Entrepreneur, Author & Content Creator',
  },
  {
    name: 'Radhika Gupta',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Radhika',
    bio: 'MD & CEO, Edelweiss AMC',
  },
  {
    name: 'Nithin Kamath',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nithin',
    bio: 'Founder & CEO, Zerodha',
  },
];

const blogPosts = [
  {
    title: "How to Start SIP Investing in 2026: A Complete Beginner's Guide",
    slug: 'sip-investing-beginners-guide-2026',
    excerpt: 'Everything you need to know about starting Systematic Investment Plans (SIPs) in India. From choosing the right index funds to understanding taxation.',
    content: `
# Systematic Investment Planning (SIP): Your Guide to Wealth Creation

Investing in the Indian stock market can seem daunting, but **Systematic Investment Plans (SIPs)** offer a simple and effective way to build wealth over time. This guide covers everything you need to know to get started in 2026.

## What is a SIP?

A SIP allows you to invest a fixed amount regularly (e.g., ₹5,000 every month) into mutual funds. It inculcates discipline and utilizes the power of *rupee cost averaging* and *compounding*.

## Why Choose SIPs?

1. **Rupee Cost Averaging:** You buy more units when prices are low and fewer when prices are high, averaging out your cost of investment over time.
2. **Power of Compounding:** By staying invested for the long term, you earn returns on your returns. A ₹10,000 monthly SIP for 20 years at 12% annual return can grow to over ₹1 Crore!
3. **Discipline:** It automates your savings and investing process.

## How to Get Started

### Step 1: Define Your Goals
Are you saving for a house, retirement, or a child's education? Your goals will determine your investment horizon and risk appetite.

### Step 2: Complete KYC
You must complete your Know Your Customer (KYC) process, which usually requires PAN, Aadhaar, and a bank account link.

### Step 3: Choose the Right Fund
For beginners, **Index Funds** (like Nifty 50 or Sensex index funds) are a great starting point due to their low expense ratios and broad market exposure.

### Step 4: Set Up the SIP
Use platforms like Zerodha Coin, Groww, or Kuvera to easily set up automated monthly deductions from your bank account.

## Top Mutual Fund Categories for Beginners

*   **Large Cap Index Funds:** Low risk, steady growth (e.g., UTI Nifty 50 Index Fund).
*   **Flexi-Cap Funds:** Medium risk, fund manager has flexibility to invest across market caps (e.g., Parag Parikh Flexi Cap Fund).
*   **ELSS (Tax Saving) Funds:** Comes with a 3-year lock-in but offers tax benefits under Section 80C.

> "Compound interest is the eighth wonder of the world. He who understands it, earns it... he who doesn't... pays it." - Albert Einstein

Start small, but start today. Time in the market always beats timing the market.
    `,
    category: 'investing',
    tags: ['SIP', 'Mutual Funds', 'Beginner', 'Index Funds'],
    coverImage: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    author: mockAuthors[0],
    readTime: 6,
    likes: 124,
    views: 1540,
    isFeatured: true,
    isPublished: true,
    publishedAt: new Date('2026-02-15T10:00:00Z'),
  },
  {
    title: 'Section 80C vs New Tax Regime: Which Saves You More?',
    slug: 'section-80c-vs-new-tax-regime',
    excerpt: 'Confused between the old tax regime with 80C deductions and the new simplified tax regime? Here is a breakdown to help you choose.',
    content: `
# Navigating the Tax Labyrinth: Old vs. New Regime

Every year, Indian taxpayers face a crucial decision: should they stick with the traditional tax regime and its various deductions (like Section 80C) or switch to the newer, simplified regime? Let's break down the math.

## The Old Tax Regime (With Deductions)

The old tax regime rewards you for saving and investing. The most prominent is **Section 80C**, which allows deductions up to ₹1.5 Lakhs.

### Common 80C Investments:
*   ELSS Mutual Funds
*   Public Provident Fund (PPF)
*   Employees' Provident Fund (EPF)
*   Life Insurance Premiums
*   Principal repayment of Home Loan

Additional popular deductions include:
*   **Section 80D:** Medical insurance premiums (up to ₹25,000 for self/family and ₹50,000 for senior citizen parents).
*   **Section 24(b):** Home loan interest (up to ₹2 Lakhs).
*   **HRA (House Rent Allowance)**

## The New Tax Regime (Simplified, No Deductions)

Introduced to simplify tax filing, the new regime offers lower tax slab rates but strips away most major deductions, including 80C, 80D, HRA, and LTA. (Note: Standard deduction of ₹50,000 applies to both).

### Benefits of the New Regime:
1.  **Lower tax rates** for incomes up to ₹15 Lakhs.
2.  **No need to lock up capital** in specific tax-saving instruments. You have more liquidity.
3.  Simpler filing process.

## Which One Should You Choose?

The decision boils down to your **income level and the amount of eligible deductions** you claim.

### Scenario 1: Low Deductions
If your total deductions (80C, HRA, 80D, etc.) are less than ₹1.5 Lakhs - ₹2 Lakhs, the **New Tax Regime** will typically result in lower taxes.

### Scenario 2: High Deductions
If you claim the full ₹1.5 Lakhs under 80C, pay significant rent (HRA), and perhaps have a home loan or high medical insurance premiums, the **Old Tax Regime** usually saves you more money.

## The Breakeven Point Strategy

Calculate your "breakeven point." Use an online tax calculator to see your liability under both regimes. As your income and eligible investments change year over year, revisit this calculation before the July filing deadline.
    `,
    category: 'tax-planning',
    tags: ['Income Tax', '80C', 'New Tax Regime', 'Tax Saving'],
    coverImage: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    author: mockAuthors[1],
    readTime: 5,
    likes: 342,
    views: 4500,
    isFeatured: true,
    isPublished: true,
    publishedAt: new Date('2026-02-10T09:30:00Z'),
  },
  {
    title: 'Building a ₹1 Crore Corpus: The Power of Compounding',
    slug: 'building-one-crore-corpus-compounding',
    excerpt: 'Discover the mathematical magic of compounding and learn actionable steps to hit your first ₹1 Crore milestone.',
    content: `
# The Magic of Compounding: Your Path to ₹1 Crore

"Compound interest is the eighth wonder of the world," famously quote often attributed to Einstein. In personal finance, it is the undeniable engine of wealth creation. 

Reaching a ₹1 Crore corpus might seem like a mountainous task, but when broken down over time utilizing compounding, it becomes a predictable mathematical journey.

## What is Compounding?

Simply put, compounding is earning returns on your returns over time. While simple interest only grows the principal, compound interest causes your money to grow exponentially. 

## The Math Behind a Crore

Let's assume a realistic long-term annual return of **12%** from equity mutual funds. Here is what it takes to reach ₹1 Crore depending on when you start:

| Monthly SIP Amount | Years to Reach ₹1 Crore | Total Investment | Total Gain |
| :--- | :--- | :--- | :--- |
| ₹5,000 | ~26 Years | ₹15.6 Lakhs | ~₹84.4 Lakhs |
| ₹10,000 | ~20 Years | ₹24.0 Lakhs | ~₹76.0 Lakhs |
| ₹20,000 | ~15 Years | ₹36.0 Lakhs | ~₹64.0 Lakhs |
| ₹50,000 | ~9 Years | ₹54.0 Lakhs | ~₹46.0 Lakhs |

### The Cost of Delay
Notice the substantial difference. If you delay starting a ₹10,000 monthly SIP by just 5 years, you miss out on exponential growth in the later years. **Time is your greatest asset.**

## How to Accelerate Your Journey

1.  **Start Now:** Even if it's just ₹1,000 a month. Getting into the habit is crucial.
2.  **Increase Investments Annually (Step-Up SIP):** As your salary increases, increase your SIP amount by 10-15% every year. This drastically reduces the time needed to hit your goal.
3.  **Stay Invested During Market Dips:** Volatility is a feature, not a bug, of equity markets. Don't panic sell when the market drops 10-20%.
4.  **Avoid Unnecessary Withdrawals:** Let the compounding engine run uninterrupted. 

Building a ₹1 Crore portfolio isn't about picking the next multi-bagger stock; it's about boring, consistent, and disciplined investing over decades.
    `,
    category: 'wealth-building',
    tags: ['Compounding', 'Crorepati', 'Long Term Investing', 'SIP'],
    coverImage: 'https://images.unsplash.com/photo-1627843232842-8c886eeb1e34?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    author: mockAuthors[2],
    readTime: 7,
    likes: 890,
    views: 12000,
    isFeatured: false,
    isPublished: true,
    publishedAt: new Date('2026-02-05T08:00:00Z'),
  },
  {
    title: '5 Common Mutual Fund Mistakes Indian Investors Make',
    slug: 'common-mutual-fund-mistakes-india',
    excerpt: 'Avoid these costly errors when investing in mutual funds, from chasing past returns to overlooking expense ratios.',
    content: `
# Navigating Mutual Funds: 5 Pitfalls to Avoid

Mutual funds are fantastic tools for retail investors, but many Indians fall into common behavioral psychological traps that hurt their long-term returns. Here are the top 5 mistakes to avoid.

## 1. Chasing Past Returns

It's the oldest mistake in the book. An investor looks at a fund that returned 40% last year and immediately jumps in. 

**Why it's bad:** Markets move in cycles. The sector that outperformed last year is often the one that underperforms the next. 
**The Fix:** Focus on consistent performance over 5-10 year periods across different market cycles, rather than 1-year spikes.

## 2. Owning Too Many Funds (Over-diversification)

Many investors hold 15-20 different mutual funds, thinking they are diversifying. 

**Why it's bad:** You're likely holding the same underlying stocks multiple times, creating an "index hugger" portfolio but paying higher active management fees. This dilutes returns.
**The Fix:** Limit your portfolio to 3-5 distinct funds (e.g., 1 Large Cap/Index, 1 Flexi Cap, 1 Mid Cap, 1 ELSS).

## 3. Ignoring the Expense Ratio

The expense ratio is the annual fee the Fund House charges to manage your money. 

**Why it's bad:** A difference between an expense ratio of 0.5% and 1.5% might seem small now, but compounded over 20 years, it eats away a massive chunk of your final corpus.
**The Fix:** Always opt for **Direct Plans** over Regular Plans (saving commission costs) and favor low-cost index funds where appropriate.

## 4. Stopping SIPs During Market Crashes

When the Nifty drops 15%, the instinct is to stop SIPs to "stop the bleeding."

**Why it's bad:** You are violating the core principle of investing: "Buy Low, Sell High." By stopping SIPs during a crash, you miss accumulating units at cheaper valuations.
**The Fix:** Treat market crashes as a "sale." Continue your SIPs, and if you have surplus cash, consider investing more.

## 5. Investing Without a Goal

Investing randomly without linking it to specific financial goals (retirement, child's education).

**Why it's bad:** You won't know asset allocation (equity vs. debt) ratio to maintain.
**The Fix:** Map out a concrete plan.
    `,
    category: 'investing',
    tags: ['Mutual Funds', 'Investing Mistakes', 'Portfolio Strategy'],
    coverImage: 'https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    author: mockAuthors[3],
    readTime: 4,
    likes: 56,
    views: 800,
    isFeatured: false,
    isPublished: true,
    publishedAt: new Date('2026-01-28T14:45:00Z'),
  },
   {
    title: 'Emergency Fund Calculator: How Much Do You Really Need?',
    slug: 'emergency-fund-calculator-guide',
    excerpt: 'Learn why an emergency fund is your financial bedrock and how to calculate the exact amount you need to save.',
    content: `
# Building Your Financial Moat: The Emergency Fund

Before you invest your first rupee in stocks or mutual funds, you must build a financial moat. An emergency fund is cash set aside to cover unexpected financial crises—a job loss, a medical emergency not covered by insurance, or urgent home repairs.

## Why is it Non-Negotiable?

Without an emergency fund, a sudden crisis will force you to:
1.  Take on high-interest credit card debt or personal loans.
2.  Sell your investments at a loss or interrupt compounding.

An emergency fund prevents a temporary disruption from becoming a permanent financial disaster.

## How Much Do You Need? (The 3-6-12 Rule)

The standard advice is **3 to 6 months of essential living expenses**. However, this varies based on your situation:

*   **3 Months Setup:** Ideal for single individuals renting with highly stable jobs (e.g., government employees) or strong family safety nets.
*   **6 Months Setup:** The sweet spot for most professionals, couples, and those with EMI commitments or dependents.
*   **9-12 Months Setup:** Recommended for freelancers, entrepreneurs with variable income, single-income families, or those working in highly volatile industries (like tech startups during a downturn).

## How to Calculate Your "Essential Living Expenses"

Do not confuse "expenses" with "income." You don't need to replace your entire salary, only what you need to survive.

Calculate monthly:
1.  Rent/Home Loan EMI
2.  Groceries & Basic Utilities (Electricity, Water, Internet)
3.  Insurance Premiums (Life, Health)
4.  Child's school fees (if applicable)
5.  Other debt EMIs (Car loan, personal loan)

*Exclude:* Dining out, vacations, luxury purchases, and ongoing SIPs/investments.

If your essential expenses are ₹40,000/month, and you belong in the 6-month category, your target Emergency Fund is **₹2.4 Lakhs**.

## Where Should You Keep It?

This money must be **highly liquid** and **safe**. Do not chase returns here.
1.  **High-Yield Savings Accounts:** For the first 1-2 months of expenses. Immediate access via ATM/UPI.
2.  **Liquid Mutual Funds or Arbitrage Funds:** For the remaining amount. Better returns than savings accounts, lower tax liability, and accessible within 24-48 hours.
3.  **Sweep-in Fixed Deposits (FDs):** Linked to your bank account for instant liquidity but earning FD interest rates.

Start small. Set a goal to save your first 1-month buffer, then build up from there.
    `,
    category: 'budgeting',
    tags: ['Emergency Fund', 'Financial Planning', 'Savings'],
    coverImage: 'https://images.unsplash.com/photo-1580519542036-ed47c1ce09eb?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    author: mockAuthors[0],
    readTime: 5,
    likes: 210,
    views: 3100,
    isFeatured: false,
    isPublished: true,
    publishedAt: new Date('2026-01-15T10:00:00Z'),
  },
];

async function seedData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI as string);
    logger.info('Connected to MongoDB. Starting Blog Post seed...');

    // Clear existing data (optional, but good for resetting state)
    // await BlogPost.deleteMany({});
    // logger.info('Cleared existing blog posts.');

    // Find existing slugs to avoid duplicates during multiple seed runs
    const existingSlugs = await BlogPost.find({}, 'slug').lean();
    const slugSet = new Set(existingSlugs.map((p) => p.slug));

    const postsToInsert = blogPosts.filter((post) => !slugSet.has(post.slug));

    if (postsToInsert.length === 0) {
      logger.info('No new blog posts to seed. Database already has these posts.');
      process.exit(0);
    }

    const insertedPosts = await BlogPost.insertMany(postsToInsert);
    
    // Self-reference related posts (just linking sequential posts as an example)
    for (let i = 0; i < insertedPosts.length; i++) {
        const post = insertedPosts[i];
        const related = [];
        if (i > 0) related.push(insertedPosts[i-1]._id);
        if (i < insertedPosts.length - 1) related.push(insertedPosts[i+1]._id);
        
        await BlogPost.updateOne(
            { _id: post._id },
            { $set: { relatedPosts: related } }
        );
    }

    logger.info(`Successfully seeded ${insertedPosts.length} blog posts with relations.`);
    process.exit(0);
  } catch (error) {
    logger.error(`Error seeding blog posts: ${error}`);
    process.exit(1);
  }
}

// Ensure the script is executed directly
if (require.main === module) {
  seedData();
}

export { seedData };
