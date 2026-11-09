-- Réglages techniques persistants (clé → valeur), jamais effacés par le seed : `demoResetId` = identifiant de la
-- dernière réinitialisation de la démo appliquée par le build Vercel (DEMO_RESET_ID). Nouvelle table uniquement :
-- le code précédent continue de fonctionner sur la base migrée.

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
