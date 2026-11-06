import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { systemClock } from '../lib/clock';
import { runRetention } from './retention';

// Exécution ponctuelle (cron système) : npm run retention -w apps/api
const prisma = new PrismaClient();
runRetention(prisma, systemClock)
  .then((r) => {
    console.info(
      `Rétention : ${r.locationPingsDeleted} position(s) et ${r.otpCodesDeleted} code(s) OTP supprimés (avant ${r.cutoff.toISOString()})`,
    );
  })
  .finally(() => prisma.$disconnect());
