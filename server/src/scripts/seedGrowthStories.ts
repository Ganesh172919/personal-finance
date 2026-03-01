import mongoose from 'mongoose';
import { GrowthStory } from '../models/growthStoryModel';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';

const MONGODB_URI = getEnv().MONGO_URI;

const mockStories = [
  {
    title: "From ₹8 Lakh Debt to ₹50 Lakh Net Worth in 3 Years — Priya's Story",
    slug: '8-lakh-debt-to-50-lakh-net-worth-priya',
    persona: '27-year-old Software Engineer',
    location: 'Bangalore',
    summary: 'Crushed credit card debt using the avalanche method and aggressively invested in index funds.',
    challenge: 'Accumulated ₹8 Lakhs in credit card and personal loan debt early in career due to lifestyle inflation and lack of financial awareness.',
    journey: `
## The Challenge
When I moved to Bangalore for my first tech job, the freedom was intoxicating. Swiggy every night, weekend trips to Gokarna, and swiping my credit card for the latest gadgets became the norm. Before I knew it, I was staring at ₹8 Lakhs in high-interest debt across three credit cards and a personal loan. The EMIs were suffocating, taking up 40% of my take-home pay.

## The Turning Point
The anxiety of living paycheck to paycheck finally hit me when I couldn't afford a sudden medical expense for my mother. I realized my "high income" meant nothing if my net worth was negative.

## The Strategy
1. **The Avalanche Method:** I listed all my debts. I paid the minimum on everything but threw every extra rupee at the credit card with the highest interest rate (36% APR).
2. **Aggressive Budgeting (50-30-20 inverted):** I cut my lifestyle to the bone. No eating out, moved to a shared 1BHK, and used public transport. I survived on 30% of my income and used 70% to attack the debt.
3. **The Side Hustle:** I took up freelance UI/UX projects on weekends to increase my cash flow, dedicating 100% of this extra income to debt repayment.

## Phase 2: Building Wealth
Once I was debt-free after 14 months, I didn't succumb to lifestyle creep. I redirected the massive amount of money I was paying in EMIs directly into investments.
*   ₹40,000/month went into a Nifty 50 Index Fund.
*   ₹10,000/month into a Flexi-cap fund.
*   Built a 6-month emergency fund in an FD.

## The Outcome
Three years later, the debt is a distant memory. The compounding engine has kicked in. My restricted lifestyle during the debt payoff phase recalibrated my spending habits, making me naturally frugal but content.
    `,
    outcome: 'Paid off ₹8L debt in 14 months, built a ₹50L portfolio in the remaining 22 months.',
    timeline: '3 Years',
    financialMetrics: {
      startingNetWorth: -800000,
      currentNetWorth: 5000000,
      monthlyIncome: 140000,
      savingsRate: 65,
      debtPaidOff: 800000,
      investmentReturns: 14.5,
    },
    strategies: ['Debt Avalanche', 'Aggressive Saving (65%)', 'Index Investing', 'Side Hustle'],
    tags: ['debt-free', 'first-50L', 'software-engineer'],
    category: 'debt-freedom',
    difficulty: 'advanced',
    isVerified: true,
    isFeatured: true,
    isPublished: true,
    coverImage: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?ixlib=rb-4.0.3&auto=format&fit=crop&w=1469&q=80',
    likes: 854,
    views: 12400,
    readTime: 6,
    publishedAt: new Date('2026-02-20T10:00:00Z'),
  },
  {
    title: 'How Rajesh Built a ₹1 Crore Portfolio Starting with ₹5000/month SIPs',
    slug: 'rajesh-1-crore-portfolio-5000-sip',
    persona: '35-year-old Marketing Manager',
    location: 'Mumbai',
    summary: 'Consistency over magnitude: Reached the 1 Crore milestone by steadily increasing SIP amounts over 12 years.',
    challenge: 'No inherited wealth and a modest starting salary of ₹25,000 made building significant wealth seem impossible.',
    journey: `
## The Philosophy
I am average. Average intelligence, average salary, average background. I knew I couldn't "trade" my way to wealth. I needed a system that worked while I slept. I started earning ₹25,000 a month in 2014.

## The Strategy: Step-Up SIP
My initial SIP was pathetic: just ₹5,000 a month into a diversified equity fund. It felt microscopic compared to my goal. But the strategy was never static. I committed to a **15% Step-Up SIP**. 

Every year, when I received an appraisal, I increased my SIP amount by a minimum of 15%, sometimes 20% if the bonus was good. 
*   Year 1: ₹5,000/month
*   Year 3: ₹6,600/month
*   Year 6: ₹10,000/month
*   Year 10: ₹25,000/month

## The Execution
1.  **Automate Everything:** Compounding only works if you don't interrupt it. My SIPs were scheduled for the 2nd of every month, right after salary day. The money was gone before I could spend it.
2.  **Ignored the Noise:** I survived demonetization, the COVID crash, and various local elections without redeeming a single unit. When the market crashed 30% in 2020, my portfolio looked red. Instead of selling, I deployed my annual bonus into the market. That single decision accelerated my journey by 18 months.

## The Outcome
It took 12 slow, boring years. But looking at the dashboard today and seeing a seven-figure number is surreal. The first ₹50 Lakhs took 8 years. The next ₹50 Lakhs took just 4 years.
    `,
    outcome: 'Built a ₹1 Crore corpus entirely through disciplined mutual fund SIPs.',
    timeline: '12 Years',
    financialMetrics: {
      startingNetWorth: 50000,
      currentNetWorth: 10200000,
      monthlyIncome: 180000,
      savingsRate: 40,
      debtPaidOff: 0,
      investmentReturns: 13.8,
    },
    strategies: ['Step-Up SIP', 'Automated Investing', 'Long-term Holding (Diamond Hands)'],
    tags: ['first-crore', 'mutual-funds', 'slow-and-steady'],
    category: 'wealth-building',
    difficulty: 'beginner',
    isVerified: true,
    isFeatured: true,
    isPublished: true,
    coverImage: 'https://images.unsplash.com/photo-1556761175-5973fb0f32f7?ixlib=rb-4.0.3&auto=format&fit=crop&w=1674&q=80',
    likes: 1205,
    views: 28000,
    readTime: 5,
    publishedAt: new Date('2026-02-15T09:00:00Z'),
  },
  {
    title: 'Side Hustle to ₹3 Lakh/Month: Vikram\'s Freelancing Financial Playbook',
    slug: 'side-hustle-freelancing-playbook-vikram',
    persona: '29-year-old Freelance Designer',
    location: 'Pune',
    summary: 'Turned a weekend gig into a booming solo agency while legally optimizing taxes using Section 44ADA.',
    challenge: 'Transitioning from a stable salary to unpredictable gig income without jeopardizing financial security.',
    journey: `
## The Challenge
Quitting a stable ₹80,000/month corporate job to freelance full-time was terrifying. I had a skill (UX Design), but horrible financial management. My income in the first few months was highly unpredictable, leading to anxiety.

## The Strategy
1. **The 6-Month Buffer First:** I didn't quit until I had ₹5 Lakhs saved specifically as a "business transition fund." This meant if I earned zero for 6 months, I wouldn't starve or have to beg for my old job back.
2. **The "Salary" Approach:** As a freelancer, I don't "eat what I kill." All client payments go into a Current Account. Every month, I transfer a fixed "salary" of ₹80,000 to my Savings Account. This normalized my erratic income.
3. **Tax Optimization (The Game Changer):** I discovered Section 44ADA of the Income Tax Act. Under the Presumptive Taxation scheme, 50% of my gross receipts are assumed as profit. I pay tax only on this 50%, completely legally, without the hassle of maintaining massive books of accounts.

## Phase 2: Scaling
With my personal finances stable, I aggressively reinvested the remaining money in the Business Account to hire sub-contractors and buy better equipment.

## The Outcome
I now consistently bill over ₹3,00,000 a month. My personal "salary" is still controlled (now ₹1,20,000), while the rest acts as retained earnings for the business, heavily invested in fixed-income instruments for stability.
    `,
    outcome: 'Scaled freelance income 4X while maintaining financial stability through dedicated "business" vs "personal" account separation.',
    timeline: '2.5 Years',
    financialMetrics: {
      startingNetWorth: 500000,
      currentNetWorth: 4200000,
      monthlyIncome: 320000,
      savingsRate: 50,
      debtPaidOff: 0,
      investmentReturns: 9.5,
    },
    strategies: ['Presumptive Taxation (44ADA)', 'Income Normalization', 'Business/Personal Separation'],
    tags: ['freelancing', 'tax-saving', 'business'],
    category: 'side-hustle',
    difficulty: 'intermediate',
    isVerified: true,
    isFeatured: false,
    isPublished: true,
    coverImage: 'https://images.unsplash.com/photo-1593642702821-c823b13eb2a5?ixlib=rb-4.0.3&auto=format&fit=crop&w=1469&q=80',
    likes: 432,
    views: 9500,
    readTime: 7,
    publishedAt: new Date('2026-02-12T11:30:00Z'),
  }
];

async function seedData() {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB. Starting Growth Story seed...');

    const existingSlugs = await GrowthStory.find({}, 'slug').lean();
    const slugSet = new Set(existingSlugs.map((p) => p.slug));

    const storiesToInsert = mockStories.filter((post) => !slugSet.has(post.slug));

    if (storiesToInsert.length === 0) {
      logger.info('No new growth stories to seed. Database already has these stories.');
      process.exit(0);
    }

    const insertedStories = await GrowthStory.insertMany(storiesToInsert);

    logger.info(`Successfully seeded ${insertedStories.length} growth stories.`);
    process.exit(0);
  } catch (error: any) {
    logger.error('Error seeding growth stories: ' + (error?.message || String(error)));
    process.exit(1);
  }
}

if (require.main === module) {
  seedData();
}

export { seedData };
