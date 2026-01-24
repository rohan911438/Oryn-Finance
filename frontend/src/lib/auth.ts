// Simple JWT utility for testing purposes
// This creates a basic JWT token that the backend can verify

export function createTestJWT(walletAddress: string): string {
  const header = {
    typ: 'JWT',
    alg: 'HS256'
  };

  const payload = {
    walletAddress: walletAddress,
    username: null,
    isAdmin: false,
    level: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
  };

  // For testing, we'll use a simple approach
  // In production, this would be handled by the backend auth endpoint
  const headerEncoded = btoa(JSON.stringify(header)).replace(/[+/]/g, (m) => ({ '+': '-', '/': '_' }[m] as string)).replace(/=/g, '');
  const payloadEncoded = btoa(JSON.stringify(payload)).replace(/[+/]/g, (m) => ({ '+': '-', '/': '_' }[m] as string)).replace(/=/g, '');
  
  // For testing, create a simple signature
  // Real JWT would use HMAC SHA256 with the secret
  const signature = btoa(`test-signature-${walletAddress}`).replace(/[+/]/g, (m) => ({ '+': '-', '/': '_' }[m] as string)).replace(/=/g, '');

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

// Alternative: Just use wallet address directly for now
export function createWalletAuthToken(walletAddress: string): string {
  // Return the wallet address as the auth token
  // The backend middleware can be temporarily modified to accept this
  return walletAddress;
}