import jwt from "jsonwebtoken";
import UserModel from "../models/userModel";

const randomSuffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const createAuthedUser = async (params?: { email?: string; name?: string }) => {
  const email = params?.email || `test+${randomSuffix()}@example.com`;
  const name = params?.name || "Test User";
  const user = await UserModel.create({
    email,
    name,
    authProvider: "email",
    isEmailVerified: true
  });

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET missing in test env");
  }

  const token = jwt.sign({ id: user._id.toString() }, secret, { expiresIn: "1d" });
  return { user, cookie: `jwt=${token}` };
};
