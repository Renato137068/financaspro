-- Supabase Auth passa a gerenciar credenciais; senha/salt viram opcionais.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordSalt" DROP NOT NULL;
