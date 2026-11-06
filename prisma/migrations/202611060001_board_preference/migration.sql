CREATE TABLE "BoardPreference" (
  "userId" TEXT NOT NULL,
  "workspaceIds" TEXT[] NOT NULL,
  CONSTRAINT "BoardPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "BoardPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
