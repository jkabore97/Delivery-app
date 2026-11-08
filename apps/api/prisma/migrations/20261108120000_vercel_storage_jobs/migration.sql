-- CreateTable
CREATE TABLE "StoredFile" (
    "key" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "JobLease" (
    "name" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("name")
);


-- Plusieurs instances d'API (Vercel) : au plus une offre ouverte par commande et par livreur,
-- garanti par la base (index partiels, non exprimables dans schema.prisma : ne pas les supprimer).
-- Doublons éventuels existants : on ne garde que l'offre ouverte la plus récente.
UPDATE "DispatchOffer" d SET "status" = 'CANCELLED', "respondedAt" = CURRENT_TIMESTAMP
WHERE d."status" = 'OFFERED' AND EXISTS (
  SELECT 1 FROM "DispatchOffer" o
  WHERE o."status" = 'OFFERED' AND o."id" <> d."id"
    AND (o."orderId" = d."orderId" OR o."driverId" = d."driverId")
    AND (o."offeredAt" > d."offeredAt" OR (o."offeredAt" = d."offeredAt" AND o."id" > d."id"))
);
CREATE UNIQUE INDEX "DispatchOffer_one_open_per_order" ON "DispatchOffer"("orderId") WHERE "status" = 'OFFERED';
CREATE UNIQUE INDEX "DispatchOffer_one_open_per_driver" ON "DispatchOffer"("driverId") WHERE "status" = 'OFFERED';
