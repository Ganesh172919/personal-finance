import jwt from "jsonwebtoken";
import UserModel from "../models/userModel";

export const createAuthedUser = async () => {
  const user = await UserModel.create({
    email: "test@example.com",
    name: "Test User",
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

