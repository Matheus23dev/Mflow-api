import 'dotenv/config';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error('JWT_SECRET deve ter pelo menos 24 caracteres.');
  }
  return secret;
}
