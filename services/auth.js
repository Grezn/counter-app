const crypto = require("crypto");

const PUBLIC_PATHS = new Set([
  "/health",
  "/ready",
  "/whoami",
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function getAccessToken() {
  // APP_ACCESS_TOKEN protects the whole on-call console.
  // If it is not set, production falls back to RESET_TOKEN so existing deployments
  // become protected without requiring a new secret on the first rollout.
  return normalizeText(process.env.APP_ACCESS_TOKEN || process.env.RESET_TOKEN);
}

function getBasicAuthUser() {
  return normalizeText(process.env.APP_BASIC_AUTH_USER) || "admin";
}

function getAuthRealm() {
  return normalizeText(process.env.APP_AUTH_REALM) || "counter-app";
}

function safeEqual(actual, expected) {
  const normalizedExpected = normalizeText(expected);
  if (!normalizedExpected) return false;

  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(normalizedExpected);

  if (actualBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function parseBasicAuth(header) {
  const value = typeof header === "string" ? header : "";
  const match = /^Basic\s+(.+)$/i.exec(value);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;

    return {
      user: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function getBearerToken(header) {
  const value = typeof header === "string" ? header : "";
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1].trim() : "";
}

function requestHasToken(req, expectedToken, options = {}) {
  const headerToken = req.headers["x-app-token"];
  if (typeof headerToken === "string" && safeEqual(headerToken, expectedToken)) {
    return true;
  }

  const bearerToken = getBearerToken(req.headers.authorization);
  if (bearerToken && safeEqual(bearerToken, expectedToken)) {
    return true;
  }

  if (options.allowBasicPassword === false) {
    return false;
  }

  const basic = parseBasicAuth(req.headers.authorization);
  return Boolean(basic && safeEqual(basic.password, expectedToken));
}

function isRequestAuthorized(req) {
  const accessToken = getAccessToken();
  if (!accessToken) return true;

  const basic = parseBasicAuth(req.headers.authorization);
  if (basic && safeEqual(basic.user, getBasicAuthUser()) && safeEqual(basic.password, accessToken)) {
    return true;
  }

  return requestHasToken(req, accessToken, { allowBasicPassword: false });
}

function isPublicPath(req) {
  const pathname = String(req.path || req.url || "").split("?")[0];
  return PUBLIC_PATHS.has(pathname);
}

function authMiddleware(req, res, next) {
  if (isPublicPath(req) || isRequestAuthorized(req)) {
    return next();
  }

  res.setHeader("WWW-Authenticate", `Basic realm="${getAuthRealm()}", charset="UTF-8"`);
  return res.status(401).json({
    error: "authentication required",
  });
}

module.exports = {
  authMiddleware,
  getAccessToken,
  isRequestAuthorized,
  requestHasToken,
};
