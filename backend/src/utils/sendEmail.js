export const sendOTPEmail = async (toEmail, otp) => {
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: {
          name: "Unicloud",
          email: process.env.EMAIL_USER // The email you verify on Brevo
        },
        to: [
          {
            email: toEmail
          }
        ],
        subject: "Verify your email - Unicloud OTP",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
            <h2 style="color: #333;">Unicloud Email Verification</h2>
            <p>Your OTP is:</p>
            <h1 style="letter-spacing:5px; color: #4A90E2; font-size: 32px;">${otp}</h1>
            <p>This OTP is valid for <b>10 minutes</b>.</p>
            <p style="font-size: 12px; color: #777;">If you didn't request this, ignore this email.</p>
          </div>
        `
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Brevo API error: ${JSON.stringify(errorData)}`);
    }

    console.log("OTP email sent via Brevo HTTP API!");
    return await response.json();

  } catch (error) {
    console.error("HTTP OTP email error:", error);
    throw error; 
  }
};

export const sendResetPasswordEmail = async (toEmail, otp) => {
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: {
          name: "Unicloud",
          email: process.env.EMAIL_USER
        },
        to: [{ email: toEmail }],
        subject: "Reset your password - Unicloud",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
            <h2 style="color: #333;">Unicloud Password Reset</h2>
            <p>We received a request to reset your password. Use the code below to proceed:</p>
            <h1 style="letter-spacing:5px; color: #8b5cf6; font-size: 32px;">${otp}</h1>
            <p>This code is valid for <b>10 minutes</b>.</p>
            <p style="font-size: 12px; color: #777;">If you didn't request a password reset, please ignore this email. Your account is safe.</p>
          </div>
        `
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Brevo API error: ${JSON.stringify(errorData)}`);
    }

    console.log("Password reset email sent via Brevo!");
    return await response.json();

  } catch (error) {
    console.error("Password reset email error:", error);
    throw error;
  }
};

export const sendDeleteAccountEmail = async (toEmail, otp) => {
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: {
          name: "Unicloud",
          email: process.env.EMAIL_USER
        },
        to: [{ email: toEmail }],
        subject: "Delete your account - Unicloud OTP",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; max-width: 500px; margin: auto;">
            <h2 style="color: #ef4444; text-align: center;">Account Deletion Request</h2>
            <p>We received a request to permanently delete your Unicloud account. If you did not initiate this, please secure your account immediately.</p>
            <p>To proceed with deleting your account, enter the following confirmation code on the Profile page:</p>
            <h1 style="letter-spacing:5px; color: #ef4444; font-size: 32px; text-align: center; margin: 20px 0;">${otp}</h1>
            <p>This confirmation code is valid for <b>10 minutes</b>.</p>
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 10px; margin-top: 20px;">
              <strong style="color: #991b1b;">Warning:</strong> Deleting your account will permanently remove all connected cloud credentials, files sync data, activity logs, and user settings. This operation is permanent and cannot be undone.
            </div>
          </div>
        `
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Brevo API error: ${JSON.stringify(errorData)}`);
    }

    console.log("Account deletion verification email sent via Brevo!");
    return await response.json();

  } catch (error) {
    console.error("Account deletion email error:", error);
    throw error;
  }
};