"use strict";
// Who is signed in. Users sign in with Amazon Cognito; the browser sends the Cognito ID token with each request.
// On AWS, API Gateway's JWT authorizer checks the token's signature and expiry before the Lambda runs, and
// passes its claims here. The Lambda never sees a password.

// Returns { userId, email, name, isAdmin, issuedAt }, or null when the request has no verified token.
// isAdmin here is the Cognito "admins" group; users.js may override it with the role an admin set.
function currentUser(event) {
  const auth = event.requestContext && event.requestContext.authorizer;
  const claims = auth && auth.jwt && auth.jwt.claims;
  if (!claims || !claims.sub) return null;
  // API Gateway passes a list claim as text, for example "[admins]"
  const groups = String(claims["cognito:groups"] || "").replace(/[[\]]/g, "").split(/[\s,]+/).filter(Boolean);
  const name = claims.nickname || "Player " + claims.sub.slice(0, 4);
  return { userId: claims.sub, email: claims.email || "", name, isAdmin: groups.includes("admins"), issuedAt: Number(claims.iat) || 0 };
}

module.exports = { currentUser };
