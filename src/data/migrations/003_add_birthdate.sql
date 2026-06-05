-- 003_add_birthdate: store user birth date from Telegram
ALTER TABLE users ADD COLUMN birth_year INTEGER;
ALTER TABLE users ADD COLUMN birth_month INTEGER;
