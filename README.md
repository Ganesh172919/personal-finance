# FinWise - Personal Finance Application

A full-stack personal finance management application designed to help users track expenses, visualize financial data, and manage their money effectively.

## 🚀 Tech Stack

### Frontend (Client)

- **Framework:** React 18 with Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS with Radix UI components (shadcn/ui inspired)
- **State Management:** Zustand
- **Data Fetching & Caching:** React Query
- **Forms:** React Hook Form with Zod validation
- **Charts:** Recharts
- **Routing:** Wouter
- **Animations:** Framer Motion

### Backend (Server)

- **Runtime:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Database:** MongoDB with Mongoose
- **Authentication:** Passport.js (JWT, Google OAuth2)
- **Validation:** Zod
- **Logging:** Pino
- **File Handling:** Multer, CSV parsing (papaparse)
- **Other Services:** Stripe (Payments), Nodemailer (Emails), PDFKit (Reporting)

## 📚 Documentation

| Document                               | Description                                          |
| -------------------------------------- | ---------------------------------------------------- |
| [Architecture](./docs/ARCHITECTURE.md) | System architecture, data flow, and design decisions |
| [Setup Guide](./docs/SETUP.md)         | Environment setup & configuration                    |
| [API Reference](./docs/API.md)         | Complete REST API endpoint reference                 |
| [Database Models](./docs/DATABASE.md)  | All 44 Mongoose models & schema reference            |
| [AI Core](./docs/AI_CORE.md)           | Multi-agent AI system documentation                  |
| [Frontend](./docs/FRONTEND.md)         | React client architecture & component guide          |
| [Deployment](./docs/DEPLOYMENT.md)     | Production deployment & operations guide             |
| [Contributing](./docs/CONTRIBUTING.md) | Contribution guidelines & coding standards           |

## 📁 Project Structure

The project is structured as a monorepo with separate client and server directories:

```
personal-finance/
├── client/          # React frontend application
│   ├── src/         # Frontend source code
│   ├── package.json # Frontend dependencies
│   └── vite.config.ts
└── server/          # Node.js/Express backend API
    ├── src/         # Backend source code
    │   ├── scripts/ # Migration and utility scripts
    │   ├── worker/  # Background workers
    │   └── server.ts# Entry point
    └── package.json # Backend dependencies
```

## 🛠️ Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- MongoDB instance (local or MongoDB Atlas)
- Configuration for environmental variables (see `.env.example` in both client and server)

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd personal-finance
   ```

2. Install Client Dependencies:

   ```bash
   cd client
   npm install
   ```

3. Install Server Dependencies:
   ```bash
   cd ../server
   npm install
   ```

### Running the Application Locally

You will need to run both the client and the server simultaneously.

**Start the Server (Backend):**

```bash
cd server
npm run dev
```

**Start the Client (Frontend):**

```bash
cd client
npm run dev
```

The application will typically be available at `http://localhost:5173` (Frontend) and the API will be listening on your configured port (e.g., `http://localhost:3000`).

## 🧪 Testing

The backend includes a test suite driven by Vitest and Supertest.

```bash
cd server
npm test
```

## 📜 Scripts Overview

### Client Scripts

- `npm run dev`: Starts the Vite development server.
- `npm run build`: Compiles TypeScript and builds for production.
- `npm run lint`: Runs ESLint to check for code quality issues.
- `npm run preview`: Previews the production build locally.

### Server Scripts

- `npm run dev`: Starts the Express server in watch mode using `tsx`.
- `npm run build`: Compiles the TypeScript code.
- `npm start`: Starts the compiled production server.
- `npm run test`: Runs the Vitest test suite.
- `npm run worker:dev`: Starts the background worker in watch mode.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 📄 License

This project is licensed under the MIT License.
