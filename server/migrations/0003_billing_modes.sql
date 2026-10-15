ALTER TABLE billing_accounts ADD COLUMN mode text NOT NULL DEFAULT 'test' CHECK(mode IN ('test','live'));
ALTER TABLE billing_accounts DROP CONSTRAINT billing_accounts_pkey;
ALTER TABLE billing_accounts ADD PRIMARY KEY(user_id,mode);
