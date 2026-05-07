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
            <p style="font-size: 12px; color: #777;">If you didn’t request this, ignore this email.</p>
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