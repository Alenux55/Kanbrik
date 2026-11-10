CREATE TABLE "AccountInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "AccountInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountInvitation_email_key" ON "AccountInvitation"("email");
CREATE UNIQUE INDEX "AccountInvitation_tokenHash_key" ON "AccountInvitation"("tokenHash");
CREATE INDEX "AccountInvitation_inviterId_createdAt_idx" ON "AccountInvitation"("inviterId", "createdAt");
ALTER TABLE "AccountInvitation" ADD CONSTRAINT "AccountInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
