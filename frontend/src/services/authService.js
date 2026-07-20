import API from "../config/api";

export const loginUser = (data) =>
  API.post("/auth/login", data);

export const registerUser = (data) =>
  API.post("/auth/register", data);

export const verifyOtp = (data) =>
  API.post("/auth/verify-otp", data);

export const resendOtp = (data) =>
  API.post("/auth/resend-otp", data);

export const forgotPassword = (data) =>
  API.post("/auth/forgot-password", data);

export const resetPassword = (data) =>
  API.post("/auth/reset-password", data);
