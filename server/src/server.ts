import dotenv from "dotenv";

import { connectDB } from "./config/database";
import { configurePassport } from "./config/passport";
import { createApp } from "./app";

dotenv.config();

async function start() {
  configurePassport();
  await connectDB();

  const app = createApp();
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

start().catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

