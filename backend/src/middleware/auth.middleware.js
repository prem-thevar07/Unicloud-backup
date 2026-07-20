import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
  try {
    // Expect header: Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    let token = "";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // decoded must contain { id, email }
    req.user = {
      id: decoded.id,
      email: decoded.email
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ message: "Invalid token" });
  }
};

export default auth;
