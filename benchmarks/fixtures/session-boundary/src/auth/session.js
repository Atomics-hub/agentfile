export function createSession(user) {
  const normalized = normalizeSessionUser(user);

  return {
    subject: normalized.id,
    claims: {
      role: normalized.role,
      plan: normalized.plan
    }
  };
}

export function normalizeSessionUser(user) {
  return {
    id: String(user.id)
  };
}

