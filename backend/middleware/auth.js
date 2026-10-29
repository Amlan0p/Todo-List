import jwt from "jsonwebtoken";

// Verifies the JWT sent in the Authorization header and attaches
// the decoded user info (id, name, email) to req.user.
// The user id always comes from the verified token, never from the request body or query.
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided. Access denied." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // User ids are numeric in PostgreSQL. Tokens issued by the previous version of the app are rejected.
    if (!decoded || !/^\d{1,18}$/.test(String(decoded.id))) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }
    req.user = { ...decoded, id: String(decoded.id) };
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

export default authMiddleware;
