-- 004_user_profile: onboarding fields for new members
ALTER TABLE users ADD COLUMN is_new INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN intro_completed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN intro_step INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN famous_for TEXT;
ALTER TABLE users ADD COLUMN gender_role TEXT;
ALTER TABLE users ADD COLUMN age INTEGER;
ALTER TABLE users ADD COLUMN lifestyle TEXT;
ALTER TABLE users ADD COLUMN morals TEXT;
ALTER TABLE users ADD COLUMN sex_role TEXT;
