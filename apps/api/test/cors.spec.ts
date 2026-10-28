import { createCorsOriginValidator } from '../src/common/utils/cors.util';

describe('CORS Origin Validator Security', () => {
  it('should allow requests from explicitly configured trusted origins', (done) => {
    const validator = createCorsOriginValidator('http://localhost:5173, https://app.ule.internal');

    validator('http://localhost:5173', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      validator('https://app.ule.internal', (err2, allow2) => {
        expect(err2).toBeNull();
        expect(allow2).toBe(true);
        done();
      });
    });
  });

  it('should allow legitimate requests without an Origin header (mobile, curl, server-to-server)', (done) => {
    const validator = createCorsOriginValidator('http://localhost:5173');

    validator(undefined, (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('should reject requests from untrusted origins', (done) => {
    const validator = createCorsOriginValidator('http://localhost:5173');

    validator('https://malicious-site.example', (err, allow) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toContain(
        "Origin 'https://malicious-site.example' not allowed by CORS configuration",
      );
      expect(allow).toBeUndefined();
      done();
    });
  });

  it('should throw an error if configured with wildcard "*" origin', () => {
    expect(() => createCorsOriginValidator('*')).toThrow(
      /Wildcard CORS origin \("\*"\) is strictly prohibited/,
    );
    expect(() =>
      createCorsOriginValidator('http://localhost:5173, *'),
    ).toThrow(/Wildcard CORS origin \("\*"\) is strictly prohibited/);
  });

  it('should throw an error if configuration is empty', () => {
    expect(() => createCorsOriginValidator('')).toThrow(
      /CORS_ORIGIN configuration cannot be empty/,
    );
  });
});
