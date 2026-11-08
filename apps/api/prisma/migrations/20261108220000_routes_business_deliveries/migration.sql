-- Itinéraires en cache et cap du livreur (carte de suivi), livraisons d’entreprise (modèle B2B) et lien public
-- de suivi du destinataire. Colonnes nullables ou avec valeur par défaut uniquement : le code précédent continue
-- de fonctionner sur la base migrée.

-- CreateEnum
CREATE TYPE "FeePayer" AS ENUM ('SENDER', 'RECIPIENT');

-- AlterTable
ALTER TABLE "DriverProfile" ADD COLUMN     "lastHeading" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cashToCollect" INTEGER,
ADD COLUMN     "deliveryLegDurationS" INTEGER,
ADD COLUMN     "feePaidBy" "FeePayer",
ADD COLUMN     "owedToBusiness" INTEGER,
ADD COLUMN     "recipientIsBusiness" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "routeAttemptAt" TIMESTAMP(3),
ADD COLUMN     "routeComputedAt" TIMESTAMP(3),
ADD COLUMN     "routeDistanceM" INTEGER,
ADD COLUMN     "routeDurationS" INTEGER,
ADD COLUMN     "routeOriginLat" DOUBLE PRECISION,
ADD COLUMN     "routeOriginLng" DOUBLE PRECISION,
ADD COLUMN     "routePoints" JSONB,
ADD COLUMN     "routeSource" TEXT,
ADD COLUMN     "routeTarget" TEXT,
ADD COLUMN     "trackingToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");

