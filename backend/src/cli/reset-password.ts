/**
 * Reset a user's password from the server, for installs that can't send email:
 *   npm run reset-password -- <email> <new password>
 */
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) throw new Error('Usage: npm run reset-password -- <email> <new password>');
  if (password.length < 8) throw new Error('The new password must be at least 8 characters');
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new Error(`No user with email ${email}`);
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, 10), isActive: true } });
  await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
  console.log(`Password reset for ${user.email}. They can sign in now.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
