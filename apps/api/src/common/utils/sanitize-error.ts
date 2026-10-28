/**
 * Sanitizes error messages and stack traces to ensure connection strings,
 * credentials, and sensitive connection parameters are never leaked in logs.
 */
export function sanitizeLogMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return message;
  }

  // Redact URI credentials: postgresql://user:pass@host:port/db -> postgresql://***:***@host:port/db
  let sanitized = message.replace(
    /(postgres(?:ql)?:\/\/)([^:@\s]+):([^@\s]+)@/gi,
    '$1***:***@',
  );

  // Redact password parameter patterns: password=xyz, pwd=xyz
  sanitized = sanitized.replace(
    /(password|pwd|secret|token)=([^&\s;]+)/gi,
    '$1=***',
  );

  return sanitized;
}
