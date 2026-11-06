import type { Prisma, PrismaClient } from '@prisma/client';

/** Client Prisma ou client de transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;
