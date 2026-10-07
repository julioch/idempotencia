-- Wallet de demo con saldo inicial de 250.00 PEN
INSERT INTO wallets (user_id, currency, balance_cents)
VALUES ('usr_abc123', 'PEN', 25000)
ON CONFLICT (user_id, currency) DO NOTHING;
